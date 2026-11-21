// Regression contract: three roles render accessible, two-axis scrollable tables.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(file,'utf8');
const css=read('landing/dashboard.css');
for(const fragment of ['#content .portal-table-scroll','#content table.portal-data-table','overflow-x:auto','overflow-y:auto','max-height:min(65vh,560px)','max-height:min(57dvh,440px)','position:sticky;top:0','min-width:max(100%,760px)','width:10px;height:10px','scrollbar-width:thin'])assert.ok(css.includes(fragment),'Missing horizontal table rule: '+fragment);
const paths=['landing/admin.js','landing/dashboard.js','landing/business-workspace.js','landing/firm-workspace.js','landing/workflow-widgets.js','landing/document-upload.js'];
for(const file of paths){
 const source=read(file);
 assert.ok(source.includes('portal-table-scroll'),'Missing scrollable wrapper: '+file);
 assert.ok(source.includes('portal-data-table'),'Missing horizontal grid table: '+file);
}
for(const file of ['landing/dashboard.html','landing/admin.html'])assert.ok(read(file).includes('dashboard.css?v=table-reference1'),'Cache-busted shared styles missing in '+file);
assert.ok(read('landing/admin.js').includes("e.setAttribute('role','region')"),'Admin tables must be keyboard scrollable');
for(const selector of ['border-right:1px solid #d5dde5','background:#edf1f4!important','background:#f4f6f8','background:#0758bb','height:60px'])assert.ok(css.includes(selector),'Reference table styling missing: '+selector);
assert.ok(css.includes('background:#fff5f5'),'Danger buttons should remain distinguishable');
for(const file of ['landing/business-workspace.js','landing/firm-workspace.js','landing/workflow-widgets.js'])assert.ok(read(file).includes('rows.length')||read(file).includes('data.length'),'Existing empty state must be retained: '+file);
assert.ok(read('landing/admin.js').includes("const modules=['Dashboard','Customers','Firms'"),'Admin sidebar must remain intact');
console.log('[portal tables] Client, Firm, Admin image-reference grid borders, striped rows, blue actions, two-axis scrolling passed');
