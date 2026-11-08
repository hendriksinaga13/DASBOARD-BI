// js/sync/musthave.js
import { setGlobalSetting } from './crud.js';

export async function saveMustHaveConfig(config) {
  await setGlobalSetting('musthave', config);
}