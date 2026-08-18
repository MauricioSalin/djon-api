export const MEGABYTE = 1024 * 1024;
export const DEFAULT_FILE_LIMIT_BYTES = 50 * MEGABYTE;
export const MATERIAL_ATTACHMENT_LIMIT_BYTES = 100 * MEGABYTE;

export function fileLimitForPurpose(purpose: string) {
  return purpose === 'material-attachment'
    ? MATERIAL_ATTACHMENT_LIMIT_BYTES
    : DEFAULT_FILE_LIMIT_BYTES;
}
