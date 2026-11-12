/**
 * Notices only link plain Windows paths: a drive ("Z:\Jobs\...") or a network share
 * ("\\server\share\..."). Web links, relative paths and the like are refused.
 * Returns the path without surrounding quotes (Explorer's "Copy as path" adds them).
 */
export function cleanPath(p: string): string {
  const clean = p.trim().replace(/^"(.*)"$/, '$1')
  if (!/^([a-zA-Z]:[\\/]|\\\\[^\\]+\\)/.test(clean)) throw new Error('That is not a file or folder path, e.g. Z:\\Jobs\\P34\\Drawing.dxf')
  return clean
}
