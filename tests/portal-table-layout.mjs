// Regression contract: three roles render accessible, two-axis scrollable tables.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=file=>readFileSync(file,'utf8');
const css=read('landing/dashboard.css');
for(const fragment of ['#content .portal-table-scroll','#content table.portal-data-table','overflow-x:auto','overflow-y:auto','max-height:min(65vh,560px)','max-height:min(57dvh,440px)','position:sticky;top:0','width:max-content!important','min-width:0!important','table-layout:auto!important','width:10px;height:10px','scrollbar-width:thin'])assert.ok(css.includes(fragment),'Missing horizontal table rule: '+fragment);
const paths=['landing/admin.js','landing/dashboard.js','landing/business-workspace.js','landing/firm-workspace.js','landing/workflow-widgets.js','landing/document-upload.js'];
for(const file of paths){
 const source=read(file);
 assert.ok(source.includes('portal-table-scroll'),'Missing scrollable wrapper: '+file);
 assert.ok(source.includes('portal-data-table'),'Missing horizontal grid table: '+file);
}
for(const file of ['landing/dashboard.html','landing/admin.html'])assert.ok(read(file).includes('dashboard.css?v=excelcompact1'),'Cache-busted shared styles missing in '+file);
assert.ok(read('landing/admin.js').includes("e.setAttribute('role','region')"),'Admin tables must be keyboard scrollable');
for(const selector of ['border-right:1px solid #d5dde5','background:#edf1f4!important','background:#f4f6f8','background:#0758bb','height:43px','padding:9px 9px','min-width:53px!important'])assert.ok(css.includes(selector),'Reference table styling missing: '+selector);
assert.ok(css.includes('background:#fff5f5'),'Danger buttons should remain distinguishable');
for(const file of ['landing/business-workspace.js','landing/firm-workspace.js','landing/workflow-widgets.js'])assert.ok(read(file).includes('rows.length')||read(file).includes('data.length'),'Existing empty state must be retained: '+file);
assert.ok(read('landing/admin.js').includes("const modules=['Dashboard','Customers','Firms'"),'Admin sidebar must remain intact');
console.log('[portal tables] Client, Firm, Admin Excel-like compact intrinsic column widths and scrolling passed');

// Columns must not be forced to fill the container or retain the previous 150px minimum.
assert.ok(!css.includes('min-width:100%!important'),'Table must not stretch to dashboard width');
assert.ok(!css.includes('min-width:150px;padding:11px 12px'),'Every column should size to contents');
assert.ok(css.includes('min-width:53px!important;width:53px'),'The action menu should have a compact cell');
