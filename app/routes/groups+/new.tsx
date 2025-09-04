import { GroupEditor } from './__group-editor';
// Re-export server action without importing it in the client bundle
export { action } from './__group-editor.server';
export default GroupEditor;
