'use strict';
const STORAGE='yoyo-ui-review-20261106';
const PRODUCT={id:'tf2-key',name:'曼恩公司供应箱钥匙',game:'TF2',unit:'把',image:'assets/key.png',url:'https://steamcommunity.com/my/inventory/#440'};
const money=n=>'¥'+(n/100).toFixed(2);
const dateLabel=n=>new Date(n).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
const priceFor=i=>i<20?1120:1125;
const purchaseCost=n=>Array.from({length:n},(_,i)=>priceFor(i)).reduce((a,b)=>a+b,0);
const estimate=(target,price)=>{const qty=Math.ceil((target-1e-8)/(price*.85));const spend=purchaseCost(qty),arrival=Math.round(qty*price*.85*100);return {qty,spend,arrival,saved:arrival-spend};};
function counts(r){const c={arrived:0,transit:0,pending:0,cancelled:0};r.items.forEach(i=>c[i.status]++);c.active=c.arrived+c.transit+c.pending;c.gap=Math.max(0,r.qty-c.active);c.ready=c.arrived>=r.qty;return c;}
function paid(r){return r.items.reduce((sum,i)=>sum+(i.status==='cancelled'?0:i.cents),0);}
function status(r){if(r.cancelled)return {key:'cancelled',label:'已取消'};if(r.demoCompleted)return {key:'completed',label:'已完成'};if(!r.paidAt)return {key:'draft',label:'待付款'};const c=counts(r);if(c.ready)return {key:'ready',label:'待出售'};if(c.gap)return {key:'gap',label:'需补购'};return {key:'waiting',label:'等待到货'};}
function newRecord(target,price,id){const e=estimate(target,price);return {id,target,qty:e.qty,quotedPrice:price,createdAt:Date.now(),paidAt:null,cancelled:false,productId:PRODUCT.id,items:[],batches:[],notified:false,checkedAt:null};}
function appendBatch(r,quantity){const batchId='B'+(r.batches.length+1);const cost=purchaseCost(quantity);r.batches.push({id:batchId,qty:quantity,cents:cost,at:Date.now()});for(let i=0;i<quantity;i++)r.items.push({id:batchId+'-'+(i+1),batchId,cents:priceFor(i),status:'pending'});r.paidAt=r.paidAt||Date.now();return cost;}
function seed(){const r=newRecord(550,15.25,'D260911001');r.createdAt=Date.now()-7200000;appendBatch(r,43);r.items.forEach((i,n)=>i.status=n<36?'arrived':n<40?'transit':'pending');r.checkedAt=Date.now();return {version:1,records:[r],notifications:[],auth:'ready',quote:'normal'};}
let db;try{db=JSON.parse(localStorage.getItem(STORAGE));if(!db||db.version!==1||!Array.isArray(db.records))db=seed();}catch{db=seed();}
// Dedicated preview records do not overwrite the user's existing records.
function ensureHistoryExamples(){
 for(const [id,complete] of [['EXAMPLE-SHIPPING',false],['EXAMPLE-COMPLETED',true]]){
  if(db.records.some(r=>r.id===id))continue;
  const r=newRecord(550,15.25,id);appendBatch(r,43);r.demoExample=true;r.createdAt=Date.now()-(complete?86400000:7200000);r.checkedAt=Date.now();
  r.items.forEach((item,i)=>item.status=complete?'arrived':i<36?'arrived':i<40?'transit':'pending');
  r.demoCompleted=complete;r.notified=complete;db.records.push(r);
 }
}
ensureHistoryExamples();
// Dedicated failure example; existing records and payment history stay untouched.
if(!db.records.some(r=>r.id==='EXAMPLE-REPLENISH')){
 const r=newRecord(550,15.25,'EXAMPLE-REPLENISH');
 appendBatch(r,43);r.demoExample=true;r.createdAt=Date.now()-7200000;r.checkedAt=Date.now();
 r.items.forEach((item,i)=>item.status=i<36?'arrived':i<40?'transit':'cancelled');
 db.records.push(r);
}
// A one-time sample push illustrates the arrival deep link.
if(!db.arrivalPushExampleAdded){
 const example=db.records.find(r=>r.id==='EXAMPLE-COMPLETED');
 if(example&&!db.notifications.some(n=>n.recordId===example.id)){
  db.notifications.push({id:'N-'+example.id,recordId:example.id,at:Date.now(),read:false,demo:true});
 }
 db.arrivalPushExampleAdded=true;
}
let dismissedPushId=null;
let pushHideTimer=null;
let purchaseDraft=null;
let historyCollapsed=false;
let page='home',currentId=null,inputAmount=550,openSteps=new Set(),historyFilter='all',timer=null,toastTimer=null,returnToHistory=false,paymentSession=null;
const content=document.getElementById('content'),footer=document.getElementById('footer'),modal=document.getElementById('modal');
const current=()=>db.records.find(r=>r.id===currentId);
const quotePrice=()=>db.quote==='down'?12:15.25;
const isOffline=()=>db.quote==='offline';
const authReady=()=>db.auth!=='unbound';
const capacity=()=>db.auth==='limited'?20:96;
const validAmount=()=>Number.isFinite(inputAmount)&&inputAmount>=1&&inputAmount<=100000;
let storageFailed=false;
function save(){try{localStorage.setItem(STORAGE,JSON.stringify(db));storageFailed=false;}catch{storageFailed=true;}updateBadge();}
function updateBadge(){const n=db.notifications.filter(n=>!n.read).length;const badge=document.getElementById('badge');badge.hidden=!n;badge.textContent=n;renderPush();}
function dismissPush(id){
 dismissedPushId=id;clearTimeout(pushHideTimer);
 const host=document.getElementById('push-preview');host.hidden=true;host.dataset.noticeId='';
}
function renderPush(forcedRecordId){
 const host=document.getElementById('push-preview');
 const notice=forcedRecordId?db.notifications.find(n=>n.recordId===forcedRecordId):[...db.notifications].reverse().find(n=>!n.read&&n.id!==dismissedPushId);
 const record=notice&&db.records.find(r=>r.id===notice.recordId);
 if(!notice||!record||!counts(record).ready){host.hidden=true;host.dataset.noticeId='';clearTimeout(pushHideTimer);return;}
 if(!forcedRecordId&&!host.hidden&&host.dataset.noticeId===notice.id)return;
 clearTimeout(pushHideTimer);
 host.innerHTML=`<button class="push-open" data-action="notification-open" data-id="${record.id}"><span class="push-symbol" aria-hidden="true">YP</span><span class="push-copy"><span class="push-source"><b>悠悠有品</b><span>现在</span></span><strong>省钱买余额 · 饰品已全部到货</strong><span class="push-hint">您购买的 ${record.qty} 把饰品已全部到货，点击查看并前往 Steam 出售。</span></span></button><button class="push-close" data-action="dismiss-push" data-id="${notice.id}" aria-label="收起到货通知">×</button>`;
 host.dataset.noticeId=notice.id;host.hidden=false;
 pushHideTimer=setTimeout(()=>dismissPush(notice.id),8000);
}
function showToast(text,recordId){clearTimeout(toastTimer);const host=document.getElementById('toast');host.replaceChildren();const label=document.createElement('div');label.textContent=text;host.append(label);if(recordId){const b=document.createElement('button');b.textContent='查看兑换步骤 ›';b.dataset.action='notification-open';b.dataset.id=recordId;host.append(b);}host.hidden=false;toastTimer=setTimeout(()=>host.hidden=true,recordId?14000:4500);}
function show(title,html){document.getElementById('modal-title').textContent=title;document.getElementById('modal-body').innerHTML=html;if(!modal.open)modal.showModal();}
function close(){if(modal.open)modal.close();paymentSession=null;resetPaymentSheet();}
function resetPaymentSheet(){modal.classList.remove('payment-sheet');for(const p of ['position','left','right','bottom','width'])modal.style[p]='';}
function openRecord(id,fromHistory=false){if(!db.records.some(r=>r.id===id))return;close();currentId=id;page='detail';returnToHistory=fromHistory;openSteps.clear();render();content.scrollTop=0;}
function render(){document.getElementById('title').textContent=page==='home'?'省钱买 Steam 余额':page==='history'?'兑换记录':page==='purchase'?'批量购买':'换余额步骤';document.getElementById('back').style.visibility=page==='home'?'hidden':'visible';footer.hidden=true;footer.innerHTML='';content.classList.toggle('purchase-content',page==='purchase');updateBadge();if(page==='home')home();else if(page==='history')history();else if(page==='purchase')purchasePage();else detail();}
function recordCard(r){
 const s=status(r),c=counts(r),complete=s.key==='completed';
 const price=complete?r.quotedPrice:quotePrice();
 const saving=Math.round(r.qty*price*.85*100)-(paid(r)+purchaseCost(c.gap));
 const savingText=isOffline()&&!complete?'节省待更新':(complete?'预计已节省 ':'预计可节省 ')+money(saving);
 const text=complete?'饰品出售换余额流程已完成':s.key==='cancelled'?'本次方案已取消':s.key==='ready'?'全部到货，可前往 Steam 出售':'已到货 '+c.arrived+' · 发货中 '+c.transit+' · 待发货 '+c.pending+' 把'+(c.gap?' · 需补购 '+c.gap+' 把':'');
 const deliverySummary=['waiting','gap'].includes(s.key)?`<div class="record-delivery"><span class="pending">待发货 <b>${c.pending} 把</b></span><span class="transit">发货中 <b>${c.transit} 把</b></span><span class="arrived">已到货 <b>${c.arrived} 把</b></span>${c.gap?`<span class="gap">需补购 <b>${c.gap} 把</b></span>`:''}</div>`:`<p>${text}</p>`;
 const action={waiting:'查看到货',gap:'去补购',ready:'去出售',completed:'查看详情',cancelled:'查看记录'}[s.key]||'查看详情';
 return `<button class="record-card" data-action="record" data-id="${r.id}"><div class="record-top"><div class="record-heading"><strong>目标余额 ¥${r.target.toFixed(2)}</strong><span class="record-saving">${savingText}</span></div><span class="pill ${s.key==='gap'?'orange':complete||s.key==='ready'?'green':''}">${s.label}</span></div>${deliverySummary}<div class="record-meta"><span>${dateLabel(r.createdAt)}${r.demoExample?' · 示例':' · '+r.id.slice(-6)}</span><b>${action} ›</b></div></button>`;
}
function home(){
 const ongoing=['EXAMPLE-SHIPPING','EXAMPLE-COMPLETED','EXAMPLE-REPLENISH'].map(id=>db.records.find(r=>r.id===id)).filter(Boolean);
 content.innerHTML=`<div class="intro"><h3>省钱换 Steam 余额</h3><p>先在悠悠购买饰品，再自行到 Steam 出售，<b>用更少花费获得目标余额。</b></p></div><section class="hero"><label for="target">您想要多少 Steam 余额</label><div class="amount"><span>¥</span><input id="target" type="number" min="1" max="100000" step="0.01" inputmode="decimal" value="${validAmount()?inputAmount.toFixed(2):''}" aria-label="目标 Steam 余额"></div><div class="saving-display"><span class="saving-pitch"><span id="save-label">预计节省</span><strong id="saving"></strong></span><button class="saving-help-inline" data-action="help" data-kind="saving" aria-label="预计节省说明">?</button></div><div class="quick">${[50,100,200,500].map(v=>`<button data-action="amount" data-value="${v}">¥${v}</button>`).join('')}</div><div class="hero-foot"><p id="amount-note" class="hero-note">买饰品，再到 Steam 出售换余额</p></div></section><section id="history-panel" class="history-panel ${historyCollapsed?'is-collapsed':''}" aria-labelledby="history-heading"><div class="section-head"><h3 id="history-heading"><button id="history-toggle" class="history-toggle" data-action="toggle-history" aria-expanded="${!historyCollapsed}" aria-controls="history-content">兑换历史 <span class="history-toggle-label">${historyCollapsed?'展开':'收起'}</span><span class="history-chevron" aria-hidden="true"></span></button></h3><button class="link" data-action="history">全部记录 ›</button></div><div id="history-content" ${historyCollapsed?'hidden':''}>${ongoing.length?`<div class="ongoing-list" role="region" aria-label="兑换历史示例" tabindex="0">${ongoing.map(recordCard).join('')}</div>`:'<div class="empty">暂无进行中的兑换。输入金额即可开始。</div>'}</div></section>${storageFailed?'<p class="error tiny">浏览器未允许保存本地记录，关闭页面可能丢失本次演示。</p>':''}`;
 footer.hidden=false;footer.innerHTML='<button id="next" class="primary home-action" data-action="create">查看兑换步骤</button>';homeValues();
}
function homeValues(){
 const e=estimate(validAmount()?inputAmount:550,quotePrice());
 document.getElementById('saving').textContent=!validAmount()?'—':isOffline()?'待更新':e.saved>0?money(e.saved):'暂无';
 document.getElementById('next').disabled=!validAmount()||isOffline();
 document.getElementById('amount-note').textContent=!validAmount()?'请输入 ¥1–¥100,000 的目标金额。':isOffline()?'行情获取失败，请稍后重试。':e.saved<=0?'当前暂无价格优势，可稍后查看。':'买饰品，再到 Steam 出售换余额';
}
function history(){const records=[...db.records].sort((a,b)=>b.createdAt-a.createdAt).filter(r=>r.paidAt&&(historyFilter==='all'||status(r).key===historyFilter));content.innerHTML=`<div class="head-row"><span class="tiny">共 ${db.records.filter(r=>r.paidAt).length} 条兑换记录</span><select id="history-filter" aria-label="筛选记录"><option value="all">全部状态</option><option value="completed">已完成（示例）</option><option value="waiting">等待到货</option><option value="gap">需补购</option><option value="ready">待出售</option><option value="cancelled">已取消</option></select></div>${records.length?records.map(recordCard).join(''):'<div class="empty">暂无该状态的兑换记录。</div>'}<p class="page-note">全部到货后显示“待出售”。Steam 成交及到账需在 Steam 查看。</p>`;document.getElementById('history-filter').value=historyFilter;}
function step(n,title,body,kind,extra=''){return `<section class="step ${kind} ${n===0?'origin-step':''}"${kind==='current'?' aria-current="step"':''}><span class="node"${n===0?' role="img" aria-label="起点"':''}>${n===0?'':kind==='done'?'✓':n}</span><div class="head-row"><h3>${title}</h3>${extra}</div>${body}</section>`;}
function product(r,action){const total=r.paidAt?paid(r):purchaseCost(r.qty);return `<div class="product"><div class="thumb"><img src="${PRODUCT.image}" alt="${PRODUCT.name}"><span>×${r.qty}</span></div><div class="product-copy"><b>${PRODUCT.name}</b><small>${r.paidAt?'当前净花费':'预估花费'} <button class="question" data-action="help" data-kind="cost" aria-label="花费说明">?</button></small><strong>${money(total)}</strong></div>${action}</div>`;}
function detail(){const r=current();if(!r){page='home';home();return;}if(!r.paidAt&&!isOffline()){r.qty=estimate(r.target,quotePrice()).qty;r.quotedPrice=quotePrice();save();}const c=counts(r),s=status(r),net=quotePrice()*.85,arrival=Math.round(r.qty*net*100);if(r.cancelled){content.innerHTML=`<div class="empty"><b>本次兑换已取消</b><p>目标余额 ¥${r.target.toFixed(2)}</p><button class="link" data-action="home">返回首页</button></div>`;return;}
let html=`<div class="record-bar"><span>兑换记录 ${r.id}</span><span class="pill ${s.key==='gap'?'orange':s.key==='ready'?'green':''}">${s.label}</span></div><div class="timeline">`;
html+=step(0,'目标 Steam 余额',`<div class="target-row"><strong>¥${r.target.toFixed(2)}</strong>${!r.paidAt?'<button class="link" data-action="edit-target">修改</button>':''}</div>${!r.paidAt||openSteps.has(1)?'<p class="bridge">利用悠悠与 Steam 的饰品价差，<b>先购买饰品，再自行出售</b>，以较少花费获得 Steam 余额。根据以下步骤完成兑换。</p>':''}`,'done',r.paidAt?`<button class="link" data-action="toggle" data-step="1">${openSteps.has(1)?'收起':'说明'}</button>`:'');
let purchase='';if(r.paidAt){purchase=`<div class="collapsed">已购买 ${r.qty} 把 · 当前净花费 ${money(paid(r))}</div>${openSteps.has(2)?`<div class="fold">${product(r,'')}<p>累计支付 ${money(r.batches.reduce((a,b)=>a+b.cents,0))}，已退 ${money(r.items.filter(i=>i.status==='cancelled').reduce((a,i)=>a+i.cents,0))}。</p><button class="link" data-action="orders">查看订单明细 ›</button></div>`:''}`;}else{purchase=`${product(r,`<button class="primary" data-action="${authReady()?'buy':'login'}" ${isOffline()&&authReady()?'disabled':''}>${authReady()?'购买':'登录'}</button>`)}<div class="account-row"><span>${authReady()?'✓ Steam 账号已就绪':'需绑定并登录 Steam 后购买'}</span><button class="link" data-action="login">${authReady()?'查看':'去登录'}</button></div>${authReady()&&r.qty>capacity()?`<div class="warning">本次可购买 ${capacity()} 件，请降低目标金额。<button class="link" data-action="fit">调整金额</button></div>`:''}`;}
html+=step(1,'购买饰品',purchase,r.paidAt?'done':'current',r.paidAt?`<button class="link" data-action="toggle" data-step="2">${openSteps.has(2)?'收起':'查看'}</button>`:'<button class="question" data-action="help" data-kind="quantity" aria-label="饰品数量说明">?</button>');
let delivery;if(!r.paidAt)delivery='<p class="tiny future-copy">购买后自动检查本次饰品的到货进度。</p>';else if(c.ready&&!openSteps.has(3))delivery=`<div class="collapsed">${r.qty} / ${r.qty} 把已到货，可以前往出售。</div>`;else delivery=`<div class="delivery"><div class="delivery-heading"><b>本次购买 ${r.qty} 把</b></div><div class="arrival-tags"><div class="arrival-tag pending"><span>待卖家发货</span><strong>${c.pending}<small> 把</small></strong></div><div class="arrival-tag transit"><span>卖家发货中</span><strong>${c.transit}<small> 把</small></strong></div><div class="arrival-tag arrived"><span>已到货</span><strong>${c.arrived}<small> 把</small></strong></div></div>${c.gap?`<div class="replenish-card"><div class="replenish-copy"><div class="replenish-heading"><strong>${c.gap} 把交易失败</strong><span class="refund-label">已退款</span></div><div class="replenish-cost"><span>补购预估</span><strong>${money(purchaseCost(c.gap))}</strong><button class="question" data-action="help" data-kind="replenish" aria-label="补购说明">?</button></div></div><button class="primary" data-action="replenish">补购 ${c.gap} 把</button></div><p class="replenish-price-note">钥匙价格随行情变化，补购单价及预估花费可能调整，以下单支付金额为准。</p>`:`<p>${c.ready?'本次饰品已全部到货。':'全部到货后通知您，无需在此等待。'}</p>`}<div class="delivery-actions"><button class="link" data-action="orders">查看订单明细</button><button class="link" data-action="check">刷新到货状态</button></div><p class="tiny">上次更新 ${r.checkedAt?dateLabel(r.checkedAt):'待检测'}</p></div>`;
html+=step(2,'等待饰品到货',delivery,!r.paidAt?'future':c.ready?'done':'current',c.ready?`<button class="link" data-action="toggle" data-step="3">${openSteps.has(3)?'收起':'查看'}</button>`:'');
const steamIcon='<img class="steam-mark" src="assets/steam-icon.png" alt="">';
const saleCard=`<span class="steam-card-copy"><b>前往 Steam 出售饰品</b><small>${c.ready?'打开 TF2 库存，选择饰品后出售':'全部到货后，打开库存出售'}</small></span><span class="steam-arrow">›</span>`;
const projectedCost=r.paidAt?paid(r)+purchaseCost(c.gap):purchaseCost(r.qty);
const projectedSaving=arrival-projectedCost;
const selling=`<div class="quote-row"><span>推荐出售单价 <button class="question" data-action="help" data-kind="price" ${!c.ready?'disabled':''} aria-label="推荐售价说明">?</button></span><strong>${isOffline()?'暂不可用':money(Math.round(quotePrice()*100))+'/把'}</strong>${c.ready?'<button class="link" data-action="refresh-quote">刷新</button>':''}</div>${c.ready?`<a class="steam-card" href="${PRODUCT.url}" target="_blank" rel="noopener noreferrer">${steamIcon}${saleCard}</a><button class="link wide-link" data-action="tutorial">查看出售教程</button>`:`<button class="steam-card" disabled>${steamIcon}${saleCard}</button>`}<div class="result-summary"><div class="result-compact"><span class="result-main"><span>预计获得约</span><strong>${isOffline()?'—':money(arrival)}</strong><span>Steam 余额</span><button class="question" data-action="help" data-kind="arrival" aria-label="预估到账说明">?</button></span></div><div class="result-benefit"><span>${!isOffline()&&projectedSaving<0?'预计多花':'预计节省'} <b>${isOffline()?'—':money(Math.abs(projectedSaving))}</b></span><button class="question" data-action="help" data-kind="saving" aria-label="预计节省说明">?</button></div></div>${c.ready&&!isOffline()&&arrival<r.target*100?'<p class="tiny error">行情变化，当前预估到账低于原目标。</p>':''}`;

html+=step(3,'前往 Steam 市场出售',selling,c.ready?'current':'future');html+='</div><p class="page-note">到货按本次关联订单统计；实际出售与到账请在 Steam 查看。</p>';content.innerHTML=html;}
function buyDialog(replenish=false){
 const r=current();if(!r||r.cancelled)return;
 if(!authReady()){loginDialog();return;}
 if(isOffline()){showToast('行情暂不可用，请重新获取后购买');return;}
 if(!replenish&&r.paidAt){showToast('本次已购买，请查看到货进度');return;}
 const qty=replenish?counts(r).gap:r.qty;
 if(qty<=0){showToast('没有需要补购的缺口');return;}
 if(qty>capacity()){showToast('超出本次账号可购买额度，请调整金额');return;}
 close();purchaseDraft={id:r.id,replenish,qty,required:qty,maxEnabled:false,maxPrice:'',method:'alipay'};
 page='purchase';render();content.scrollTop=0;
}
function purchasePage(){
 const d=purchaseDraft,r=current();
 if(!d||!r||d.id!==r.id){page='detail';render();return;}
 content.innerHTML=`<section class="bulk-panel"><div class="bulk-product"><img src="${PRODUCT.image}" alt="${PRODUCT.name}"><div><h3>${PRODUCT.name}</h3><p>TF2 · 普通</p></div></div><div class="bulk-prices"><div><strong>¥11.20</strong><span>在售最低</span></div><div><strong>¥20.00</strong><span>在售最高</span></div></div><div class="bulk-quantity"><b>购买数量</b><div class="quantity-control"><button data-action="quantity-minus" aria-label="减少购买数量" ${d.qty<=d.required?'disabled':''}>−</button><span>${d.qty}</span><button data-action="quantity-plus" aria-label="增加购买数量" ${d.replenish||d.qty>=capacity()?'disabled':''}>＋</button></div><small>${capacity()} 件可购买</small></div></section><div class="bulk-options"><label><input id="purchase-max-enabled" type="checkbox" ${d.maxEnabled?'checked':''}> 设置购买最高价</label>${d.maxEnabled?`<div class="max-price-input"><span>最高单价 ¥</span><input id="purchase-max-price" type="number" min="0.01" step="0.01" inputmode="decimal" value="${d.maxPrice}" placeholder="请输入最高单价"></div>`:''}<p>${d.replenish?'仅补购本次缺口，购买后合并跟进到货。':'数量已按目标余额匹配，不少于本次所需数量。'}</p>${d.qty>d.required?'<p>您增加了购买数量，实际花费和预估到账将随之增加。</p>':''}</div>`;
 footer.hidden=false;footer.innerHTML=`<div class="bulk-total"><span>合计 <strong>${money(purchaseCost(d.qty))}</strong></span><small>已选 ${d.qty} 件 · 下单前重新核价</small></div><button class="primary" data-action="confirm-payment">立即支付</button>`;
}
function paymentConditions(){
 const d=purchaseDraft,r=current();if(!d||!r||r.cancelled||d.id!==r.id)return '本次购买已失效，请返回兑换步骤。';
 const required=d.replenish?counts(r).gap:r.paidAt?0:r.qty;
 if(!authReady()||isOffline()||required!==d.required||d.qty<required||d.qty>capacity()||(d.replenish&&d.qty!==required))return '购买条件已变化，请返回兑换步骤重新核对。';
 if(d.maxEnabled){const cap=Number(d.maxPrice);if(!Number.isFinite(cap)||cap<=0)return '请输入有效的购买最高价。';if(Math.round(cap*100)<priceFor(d.qty-1))return '最高价内的演示库存不足，请提高最高价或取消限制。';}
 return '';
}
function confirmPayment(){
 const error=paymentConditions();if(error){showToast(error);return;}
 const d=purchaseDraft;paymentSession={...d,cents:purchaseCost(d.qty)};
 show('确认支付（批量购买）',`<div class="payment-amount">${money(paymentSession.cents)}</div><div class="payment-warning">商品可能被他人抢购，请尽快完成付款</div><div class="payment-methods"><label class="payment-method ${paymentSession.cents>13053?'unavailable':''}"><span class="pay-logo wallet">YP</span><span>可用余额 <small>¥130.53${paymentSession.cents>13053?' · 余额不足':''}</small></span><input type="radio" name="payment-method" value="balance" ${paymentSession.cents>13053?'disabled':''} ${d.method==='balance'?'checked':''}></label><label class="payment-method"><span class="pay-logo alipay">支</span><span>支付宝</span><input type="radio" name="payment-method" value="alipay" ${d.method==='alipay'?'checked':''}></label><label class="payment-method"><span class="pay-logo card">¥</span><span>支付宝花呗·信用卡</span><input type="radio" name="payment-method" value="card" ${d.method==='card'?'checked':''}></label></div><button class="primary full" data-action="pay">确认付款</button><p class="payment-demo">原型演示：不产生真实扣款，成功后自动返回兑换步骤。</p>`);
 modal.classList.add('payment-sheet');
 const rect=document.querySelector('.phone').getBoundingClientRect();
 modal.style.position='fixed';modal.style.left=rect.left+'px';modal.style.right='auto';modal.style.bottom=Math.max(0,window.innerHeight-rect.bottom)+'px';modal.style.width=rect.width+'px';
}
function pay(){
 const pending=paymentSession;if(!pending)return;
 const error=paymentConditions();if(error){close();render();showToast(error);return;}
 const r=current();if(purchaseCost(pending.qty)!==pending.cents||pending.qty!==purchaseDraft.qty){close();render();showToast('报价已变化，请重新确认。');return;}
 if(!pending.replenish)r.qty=pending.qty;
 appendBatch(r,pending.qty);r.checkedAt=Date.now();save();close();purchaseDraft=null;page='detail';currentId=r.id;openSteps.clear();render();content.scrollTop=0;
 setTimeout(()=>content.querySelector('.step.current')?.scrollIntoView({block:'nearest',behavior:'smooth'}),0);
 showToast(pending.replenish?'补购成功，已合并到本次到货进度':'购买成功，正在等待卖家发货');
}
function loginDialog(){show('Steam 账号',authReady()?`<p>已绑定并登录 · 演示账号</p><p>本次可购买 ${capacity()} 件饰品。账号异常时将在购买前提示。</p><button class="primary full" data-action="close">返回兑换步骤</button>`:'<p>绑定并登录 Steam，以确认接收账号和交易条件。</p><p>此处演示已有账号流程，不输入真实账号或密码。</p><button class="primary full" data-action="logged">模拟绑定并登录</button>');}
function reconcile(r,notify=true){r.checkedAt=Date.now();if(counts(r).ready&&!r.notified){r.notified=true;const n={id:'N-'+r.id,recordId:r.id,at:Date.now(),read:false};db.notifications.push(n);if(notify)dismissedPushId=null;}save();}
function progressRecord(r){if(!r||!r.paidAt||r.cancelled)return;const i=r.items.find(i=>i.status==='transit')||r.items.find(i=>i.status==='pending');if(i)i.status=i.status==='pending'?'transit':'arrived';reconcile(r);}
function notifyOpen(id){const n=db.notifications.find(n=>n.recordId===id);if(n)n.read=true;save();openRecord(id);document.getElementById('toast').hidden=true;setTimeout(()=>content.querySelector('.step.current')?.scrollIntoView({block:'start',behavior:'smooth'}),0);}
function inbox(){show('消息通知',db.notifications.length?[...db.notifications].reverse().map(n=>`<div class="notice"><b>${n.read?'':'● '}饰品已全部到货</b><p>您的省钱买余额饰品已全部到货，请前往详情页查看并到 Steam 出售。</p><p>${dateLabel(n.at)} · ${n.recordId}</p><button class="link" data-action="notification-open" data-id="${n.recordId}">查看兑换步骤 ›</button><button class="link push-replay" data-action="preview-push" data-id="${n.recordId}">预览到货通知</button></div>`).join(''):'<div class="empty">暂无通知。饰品全部到货后，会在这里收到提醒。</div>');}
function orders(){const r=current();if(!r)return;show('本次购买与到货明细',`<p>${r.id} · 本次目标 ${r.qty} 把</p>${r.batches.map(b=>{const items=r.items.filter(i=>i.batchId===b.id);const label={pending:'待发货',transit:'发货中',arrived:'已到货',cancelled:'失败已退款'};return `<div class="detail-batch"><b>${b.id==='B1'?'首次购买':'补购订单'} ${b.id} · ${b.qty} 把</b><p>${dateLabel(b.at)} · 支付 ${money(b.cents)}</p></div>${Object.keys(label).map(k=>{const list=items.filter(i=>i.status===k);return list.length?`<div class="bill"><span>${label[k]} ${list.length} 把</span><strong>${money(list.reduce((a,i)=>a+i.cents,0))}</strong></div>`:'';}).join('')}`;}).join('')}<div class="bill total"><span>扣除已退款后的净花费</span><strong>${money(paid(r))}</strong></div><p>已到货、发货中与待发货互不重复；仍有效的订单计入本次购买数量。</p>`);}
const HELP={replenish:['补购说明','仅补购已确认交易失败并退款的缺口，待发货和发货中的饰品无需重复购买。补购按当前在售报价匹配，下单前重新核价；付款后合并到本次兑换记录，继续跟进到货。'],arrival:['预估到账说明','按推荐售价售出并扣费后的预计所得，实际到账以 Steam 成交及结算为准。余额存入 Steam 钱包，可购买游戏或饰品；行情及求购数量变化可能影响成交价格和到账金额。'],saving:['预计节省','预计节省＝预估到账金额－预估购买花费。已购买记录按净花费加预计补购花费估算。实际节省金额以交易结果为准。'],quantity:['数量换算','根据目标 Steam 余额和每件饰品预计出售后扣费所得，换算需要购买的数量；不足一件按一件计算，因此预计到账可能略高于目标。售价、手续费及实际成交情况会影响最终到账。'],cost:['预估花费','当前默认曼恩公司供应箱钥匙方案。从悠悠符合条件的在售商品中由低价到高价匹配，合计各档位的单价乘数量。下单时重新核价，实际花费以支付订单及退款为准。'],price:['推荐出售单价','参考当前 Steam 最高求购价；该档位数量有限，不保证全部按此价格成交。出售前刷新，并核对上架时的价格及预计所得。']};
function scenario(mode){let r=current();if(!r||!r.paidAt){r=db.records.find(r=>r.paidAt&&!r.cancelled);}if(!r){showToast('请先购买，或重置查看示例记录');return;}if(r.notified){showToast('此记录已全部到货，请用重置演示重新体验');return;}if(mode==='all'){r.items.filter(i=>i.status==='pending'||i.status==='transit').forEach(i=>i.status='arrived');}else if(mode==='progress'){progressRecord(r);render();return;}else{if(r.batches.length>1){showToast('补购后请用推进发货或全部到货，避免重置已买订单');return;}const split=Math.max(0,r.qty-7);r.items.forEach((i,n)=>{i.status=n<split?'arrived':n<r.qty-3?'transit':mode==='gap'?'cancelled':'pending';});}reconcile(r);if(page!=='detail'){currentId=r.id;}render();if(mode==='all'&&!counts(r).ready)showToast('在途商品已到货，仍有失败缺口需要补购');}
document.addEventListener('input',e=>{if(e.target.id==='purchase-max-price'&&purchaseDraft)purchaseDraft.maxPrice=e.target.value;if(e.target.id==='target'){inputAmount=Number(e.target.value);homeValues();}});
document.addEventListener('change',e=>{if(e.target.id==='purchase-max-enabled'&&purchaseDraft){purchaseDraft.maxEnabled=e.target.checked;purchasePage();}if(e.target.name==='payment-method'&&purchaseDraft){purchaseDraft.method=e.target.value;if(paymentSession)paymentSession.method=e.target.value;}if(e.target.id==='auth'){db.auth=e.target.value;save();render();}if(e.target.id==='quote'){db.quote=e.target.value;save();render();}if(e.target.id==='history-filter'){historyFilter=e.target.value;history();}if(e.target.id==='auto'){clearInterval(timer);timer=e.target.checked?setInterval(()=>{db.records.filter(r=>r.paidAt&&!r.cancelled&&!counts(r).ready).forEach(progressRecord);render();},10000):null;}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b||b.disabled)return;const r=current();switch(b.dataset.action){case'amount':inputAmount=Number(b.dataset.value);home();break;case'create':if(!validAmount()||isOffline())return;{const rec=newRecord(inputAmount,quotePrice(),'D'+Date.now().toString(36).toUpperCase());db.records.unshift(rec);save();openRecord(rec.id);}break;case'record':openRecord(b.dataset.id,page==='history');break;case'home':page='home';render();break;case'toggle-history':historyCollapsed=!historyCollapsed;document.getElementById('history-content').hidden=historyCollapsed;document.getElementById('history-panel').classList.toggle('is-collapsed',historyCollapsed);b.setAttribute('aria-expanded',String(!historyCollapsed));b.querySelector('.history-toggle-label').textContent=historyCollapsed?'展开':'收起';break;case'history':page='history';render();content.scrollTop=0;break;case'toggle':{const n=Number(b.dataset.step);openSteps.has(n)?openSteps.delete(n):openSteps.add(n);detail();}break;case'edit-target':if(r&&!r.paidAt)show('修改目标余额',`<p>调整金额会重新计算本次购买数量。</p><input id="edit-amount" type="number" min="1" max="100000" step="0.01" value="${r.target.toFixed(2)}" aria-label="目标余额"><button class="primary full" data-action="save-target">保存金额</button><button class="link wide-link" data-action="cancel-record">取消本次未付款方案</button>`);break;case'save-target':{const value=Number(document.getElementById('edit-amount').value);if(!Number.isFinite(value)||value<1||value>100000||isOffline()){showToast('请检查金额或行情');return;}r.target=value;r.qty=estimate(value,quotePrice()).qty;r.quotedPrice=quotePrice();save();close();detail();}break;case'cancel-record':if(r&&!r.paidAt){r.cancelled=true;save();close();page='home';render();}break;case'fit':if(r&&!r.paidAt){r.target=Math.floor(capacity()*quotePrice()*.85*100)/100;r.qty=estimate(r.target,quotePrice()).qty;save();detail();}break;case'login':loginDialog();break;case'logged':db.auth='ready';save();close();render();break;case'buy':buyDialog(false);break;case'replenish':buyDialog(true);break;case'confirm-payment':confirmPayment();break;case'quantity-minus':if(purchaseDraft&&purchaseDraft.qty>purchaseDraft.required){purchaseDraft.qty--;purchasePage();}break;case'quantity-plus':if(purchaseDraft&&!purchaseDraft.replenish&&purchaseDraft.qty<capacity()){purchaseDraft.qty++;purchasePage();}break;case'pay':pay();break;case'orders':orders();break;case'check':if(r&&r.paidAt){reconcile(r);render();showToast('已更新本次到货状态');}break;case'refresh-quote':db.quote='normal';save();render();showToast('已刷新演示推荐售价');break;case'tutorial':show('如何出售饰品','<p>① 在 Steam 库存中找到本次收到的 TF2 钥匙。</p><p>② 选择出售，核对价格、费用和预计所得。</p><p>③ 按 Steam 提示完成上架与确认。成交及结算情况请在 Steam 查看。</p>');break;case'help':{const info=HELP[b.dataset.kind];show(info[0],'<p>'+info[1]+'</p>');}break;case'inbox':inbox();break;case'dismiss-push':dismissPush(b.dataset.id);break;case'preview-push':close();renderPush(b.dataset.id);break;case'notification-open':notifyOpen(b.dataset.id);break;case'scenario':scenario(b.dataset.mode);break;case'progress':scenario('progress');break;case'all':scenario('all');break;case'reset':show('重置演示记录','<p>将清除本原型的本地演示记录和通知，恢复 36 把已到货、7 把待到货的示例。</p><button class="primary full" data-action="confirm-reset">重置演示</button>');break;case'confirm-reset':clearInterval(timer);timer=null;db=seed();page='home';currentId=null;openSteps.clear();save();close();render();break;case'close':close();break;}});
document.getElementById('back').onclick=()=>{page=page==='purchase'?'detail':page==='detail'&&returnToHistory?'history':'home';purchaseDraft=null;close();render();content.scrollTop=0;};
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
modal.addEventListener('close',()=>{if(!modal.open){paymentSession=null;resetPaymentSheet();}});
save();render();
// Presentation mode: replay on every page load without changing read state.
if(db.notifications.some(n=>n.recordId==='EXAMPLE-COMPLETED'))renderPush('EXAMPLE-COMPLETED');
