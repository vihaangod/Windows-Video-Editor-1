import assert from 'node:assert/strict';
import test from 'node:test';
import { getProjectFolderNameError, getProjectNameError, MAX_PROJECT_FOLDERS } from './project-library-utils.ts';

test('project folders have a fixed maximum of ten', () => {
  assert.equal(MAX_PROJECT_FOLDERS, 10);
});

test('folder names are trimmed, bounded, and unique without regard to case', () => {
  const folders = [{ id: 'one', name: 'Gaming Edits' }];
  assert.equal(getProjectFolderNameError('  Gaming Edits ', folders), 'A folder with that name already exists.');
  assert.equal(getProjectFolderNameError('  Gaming Edits ', folders, 'one'), null);
  assert.equal(getProjectFolderNameError('   ', folders), 'Folder names must be between 1 and 48 characters.');
  assert.equal(getProjectFolderNameError('x'.repeat(49), folders), 'Folder names must be between 1 and 48 characters.');
  assert.equal(getProjectFolderNameError('  Shorts  ', folders), null);
});

test('project names remain editable but cannot be blank or exceed the UI limit', () => {
  assert.equal(getProjectNameError('   '), 'Project names must be between 1 and 100 characters.');
  assert.equal(getProjectNameError('x'.repeat(101)), 'Project names must be between 1 and 100 characters.');
  assert.equal(getProjectNameError('  Final cut  '), null);
});
