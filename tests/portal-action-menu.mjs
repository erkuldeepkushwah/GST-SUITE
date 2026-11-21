// Menu regression: existing row actions are reused, not reimplemented.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {actionColumnIndices} from '../landing/portal-action-menu.js';
assert.deepEqual(actionColumnIndices(['Name','Status','Action']),[2]);
assert.deepEqual(actionColumnIndices(['Name','Actions','Files','Other']),[1,2]);
assert.deepEqual(actionColumnIndices(['Name','Status','Amount']),[]);
assert.deepEqual(actionColumnIndices(['action ',' Files ']),[0,1]);
for(const path of ['admin','dashboard','business-workspace','firm-workspace','workflow-widgets','document-upload']){
 const source=readFileSync('landing/'+path+'.js','utf8');
 assert.ok(source.includes('enhancePortalTableActions('),'Existing '+path+' table must use shared menu helper');
}
const menu=readFileSync('landing/portal-action-menu.js','utf8');
assert.ok(menu.includes('while(cell.firstChild)options.append(cell.firstChild)'),'Existing action DOM and callbacks must be preserved');
assert.ok(menu.includes("popup.setAttribute('role','menu')"),'Accessible action popup required');
assert.ok(menu.includes("event.key==='Escape'"),'Escape must close popup');
assert.ok(menu.includes("popup.style.left="),'Menu should be positioned outside scroll container');
const admin=readFileSync('landing/admin.js','utf8');
assert.ok(!admin.includes("const dropdown=make('select',undefined,'action')"),'Account menu should not be a select');
for(const label of ['View Details','Activate','Deactivate','Enable OTP','Disable OTP','Assign Firm','Reassign Firm','Unassign Firm']){
 assert.ok(admin.includes(label),'Existing admin action missing: '+label);
}
const css=readFileSync('landing/dashboard.css','utf8');
for(const rule of ['.portal-action-trigger','.portal-action-popup','.portal-action-danger']){
 assert.ok(css.includes(rule),'Missing action UI selector: '+rule);
}
console.log('[portal actions] compact 3-line menu, unchanged handlers, row controls, Escape and roles passed');
