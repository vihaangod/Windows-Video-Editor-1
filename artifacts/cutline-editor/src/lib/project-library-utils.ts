export const MAX_PROJECT_FOLDERS = 10;

export type NamedProjectFolder = { id: string; name: string };

export function getProjectFolderNameError(
  requestedName: string,
  folders: NamedProjectFolder[],
  excludeFolderId?: string,
): string | null {
  const name = requestedName.trim();
  if (!name || name.length > 48) {
    return 'Folder names must be between 1 and 48 characters.';
  }
  if (folders.some((folder) =>
    folder.id !== excludeFolderId && folder.name.trim().toLowerCase() === name.toLowerCase()
  )) {
    return 'A folder with that name already exists.';
  }
  return null;
}

export function getProjectNameError(requestedName: string): string | null {
  const name = requestedName.trim();
  if (!name || name.length > 100) {
    return 'Project names must be between 1 and 100 characters.';
  }
  return null;
}
