export function validateFileSecure(file: File): { valid: boolean; error?: string } {
  const MAX_SIZE = 500 * 1024 * 1024; // 500MB
  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'File too large' };
  }

  const dangerousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs'];
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (dangerousExtensions.includes(ext)) {
    return { valid: false, error: 'File type not allowed' };
  }

  return { valid: true };
}
