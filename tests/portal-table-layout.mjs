// Regression contract: all three roles render real horizontal, accessible tables.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(file,'utf8');
const css=read('landing/dashboard.css');
for(const fragment of ['#content .portal-table-scroll','#content table.portal-data-table','overflow-x:auto','min-width:max(100%,760px)','scrollbar-width:thin'])assert.ok(css.includes(fragment),'Missing horizontal table rule: '+fragment);
const paths=['landing/admin.js','landing/dashboard.js','landing/business-workspace.js','landing/firm-workspace.js','landing/workflow-widgets.js','landing/document-upload.js'];
for(const file of paths){
 const source=read(file);
 assert.ok(source.includes('portal-table-scroll'),'Missing scrollable wrapper: '+file);
 assert.ok(source.includes('portal-data-table'),'Missing horizontal grid table: '+file);
}
for(const file of ['landing/dashboard.html','landing/admin.html'])assert.ok(read(file).includes('dashboard.css?v=horizontal1'),'Cache-busted shared styles missing in '+file);
assert.ok(read('landing/admin.js').includes("e.setAttribute('role','region')"),'Admin tables must be keyboard scrollable');
for(const file of ['landing/business-workspace.js','landing/firm-workspace.js','landing/workflow-widgets.js'])assert.ok(read(file).includes('rows.length')||read(file).includes('data.length'),'Existing empty state must be retained: '+file);
assert.ok(read('landing/admin.js').includes("const modules=['Dashboard','Customers','Firms'"),'Admin sidebar must remain intact');
console.log('[portal tables] Client, Firm, Admin horizontal tables, responsive styling and module versions passed');
