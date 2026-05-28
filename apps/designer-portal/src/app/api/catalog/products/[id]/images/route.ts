import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@patina/supabase/server';
import { isImageFile, MAX_FILE_SIZE, formatFileSize } from '@/lib/media-utils';

// POST /api/catalog/products/[id]/images
// Uploads an image to the public `product-images` bucket and appends the
// resulting public URL to `products.images` (jsonb/text[] array).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: productId } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: 'UNAUTHORIZED', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate image type using shared media-utils helper.
    if (!isImageFile(file.type)) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: `File type ${file.type || 'unknown'} is not a supported image` },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: `File size exceeds ${formatFileSize(MAX_FILE_SIZE)} limit` },
        { status: 400 }
      );
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    // First path segment is the user id so the bucket's update/delete RLS
    // (which keys on storage.foldername(name)[1] = auth.uid()) is satisfied.
    const filePath = `${user.id}/${productId}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, file, { cacheControl: '3600', upsert: false });

    if (uploadError) {
      return NextResponse.json(
        { error: 'UPLOAD_FAILED', message: uploadError.message },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from('product-images')
      .getPublicUrl(filePath);

    const imageUrl = urlData.publicUrl;

    // Append the new URL to the existing images array.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const { data: existing } = await sb
      .from('products')
      .select('images')
      .eq('id', productId)
      .single();

    const nextImages = [
      ...((existing?.images as string[] | null) ?? []),
      imageUrl,
    ];

    const { error: updateError } = await sb
      .from('products')
      .update({ images: nextImages })
      .eq('id', productId);

    if (updateError) {
      return NextResponse.json(
        { error: 'UPDATE_FAILED', message: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ data: { imageUrl, images: nextImages } });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'SERVER_ERROR', message: err?.message ?? 'Failed to upload product image' },
      { status: 500 }
    );
  }
}
