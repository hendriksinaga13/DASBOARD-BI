import { parseLBP, parseDMP, detectFileType } from './parser.js';
self.onmessage = ({ data }) => {
  const { id, text, forcedType } = data;
  try {
    const type = forcedType || detectFileType(text);
    const result = type === 'DMP' ? parseDMP(text) : parseLBP(text);
    self.postMessage({ id, ok: true, type, result });
  } catch(err){
    self.postMessage({ id, ok: false, error: err.message });
  }
};