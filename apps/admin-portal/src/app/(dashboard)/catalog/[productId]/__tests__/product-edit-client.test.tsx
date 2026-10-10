/**
 * ProductEditPageClient Component Tests
 *
 * F22 (SQ-704 walk, QA.md:254-271): the product editor's onToast handler
 * must reach the Toaster that is actually mounted (sonner, app/layout.tsx),
 * not the unmounted Radix @/components/ui/use-toast store, or every toast
 * from the editor — including the delete dialog's 409 refusal — is dropped
 * silently.
 *
 * @module app/(dashboard)/catalog/[productId]/__tests__/product-edit-client
 */

import { render } from "@testing-library/react";
import { toast } from "sonner";
import { ProductEditPageClient } from "../product-edit-client";

jest.mock("sonner", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock("@/hooks/use-admin-products", () => ({
  useProduct: () => ({
    product: { id: "prod-1", name: "Oak Console" },
    isLoading: false,
    error: null,
  }),
  useUpdateProduct: () => ({ mutateAsync: jest.fn() }),
  useDeleteProduct: () => ({ mutateAsync: jest.fn() }),
  usePublishProduct: () => ({ mutateAsync: jest.fn() }),
  useUnpublishProduct: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => null,
}));

jest.mock("@/components/catalog/detail/admin-edit-bar", () => ({
  AdminEditBar: () => null,
}));

jest.mock("@/components/catalog/detail/validation-issues-bar", () => ({
  ValidationIssuesBar: () => null,
}));

jest.mock("@/components/catalog/detail/seo-panel", () => ({
  SEOPanel: () => null,
}));

// Capture the onToast callback the page wires into the provider so the test
// can call it directly with each variant, exactly as the real context's
// save/publish/unpublish/delete paths do.
let capturedOnToast: ((message: string, variant: string) => void) | undefined;

jest.mock("@patina/catalog-ui", () => ({
  ProductEditProvider: ({ onToast, children }: any) => {
    capturedOnToast = onToast;
    return <>{children}</>;
  },
  useProductEdit: () => ({
    toggleMode: jest.fn(),
    saveNow: jest.fn(),
    mode: "present",
  }),
  HeroGallery: () => null,
  ProductIdentity: () => null,
  ProductStory: () => null,
  MaterialCloseups: () => null,
  Specifications: () => null,
  MakerStory: () => null,
  PairsWith: () => null,
  DesignerIntelligence: () => null,
  defaultNormalize: (raw: any) => raw,
}));

describe("ProductEditPageClient onToast routing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedOnToast = undefined;
  });

  it("routes an error toast to sonner, the Toaster actually mounted in app/layout.tsx", () => {
    render(<ProductEditPageClient productId="prod-1" />);

    expect(capturedOnToast).toBeDefined();
    capturedOnToast!(
      "A product on a line can't be deleted. Merge it into the one you keep.",
      "error",
    );

    expect(toast.error).toHaveBeenCalledWith(
      "A product on a line can't be deleted. Merge it into the one you keep.",
    );
  });

  it("routes success, warning, and info toasts to their matching sonner call", () => {
    render(<ProductEditPageClient productId="prod-1" />);

    capturedOnToast!("Changes published", "success");
    capturedOnToast!("Product unpublished", "warning");
    capturedOnToast!("Just so you know", "info");

    expect(toast.success).toHaveBeenCalledWith("Changes published");
    expect(toast.warning).toHaveBeenCalledWith("Product unpublished");
    expect(toast.info).toHaveBeenCalledWith("Just so you know");
  });
});
