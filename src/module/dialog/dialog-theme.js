/** Add the shared OSP dialog marker classes without mutating caller options. */
export function ospDialogOptions(options = {}) {
  const source = options ?? {};
  const callerClasses = Array.isArray(source.classes)
    ? source.classes
    : source.classes ? [source.classes] : [];
  return {
    ...source,
    classes: [...new Set(['osp', 'osp-dialog', ...callerClasses])],
  };
}
