// js/sync/programs.js
import { setGlobalSetting } from './crud.js';
import { loadPrograms } from '../core/programs.js';

export async function savePrograms(list) {
  await setGlobalSetting('programs', { list });
}

export async function upsertProgram(program) {
  const list = loadPrograms().filter(p => p.id !== program.id);
  list.unshift(program);
  await savePrograms(list);
  return program;
}

export async function deleteProgram(id) {
  const list = loadPrograms().filter(p => p.id !== id);
  await savePrograms(list);
}