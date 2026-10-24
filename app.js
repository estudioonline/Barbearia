const services=[
{id:'corte',name:'Corte Masculino',desc:'Corte personalizado com acabamento e finalização.',price:45,duration:50},
{id:'barba',name:'Barba',desc:'Modelagem, acabamento e cuidado completo da barba.',price:35,duration:40},
{id:'combo',name:'Corte + Barba',desc:'Experiência completa para renovar o visual.',price:70,duration:90},
{id:'acabamento',name:'Acabamento',desc:'Pezinho, contorno e pequenos ajustes.',price:20,duration:30}
];
const barbers=[{id:'liedson',name:'Liedson',specialty:'Proprietário e barbeiro • cortes, barba e acabamento'}];
const API='https://hncpyfvyffawdveidikl.supabase.co/functions/v1/barbearia-booking';
const API_KEY='sb_publishable_vuoGNU0lSuM9Trm7RqCoQQ_LyedLwMb';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const money=n=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const localKey='barbearia_liedson_confirmados_v3';
const getLocal=()=>{try{return JSON.parse(localStorage.getItem(localKey)||'[]')}catch{return[]}};
const saveLocal=v=>localStorage.setItem(localKey,JSON.stringify(v));
const fmtDate=v=>new Date(v+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
const toMinutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m};
const fromMinutes=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');

function render(){
 $('#serviceGrid').innerHTML=services.map((s,i)=>`<article class="service-card"><div class="service-number">0${i+1}</div><h3>${s.name}</h3><p>${s.desc}</p><div class="service-bottom"><strong>${money(s.price)}</strong><span>${s.duration} min</span></div></article>`).join('');
 $('#barberGrid').innerHTML=barbers.map(b=>`<article class="barber-card"><div class="avatar">${b.name[0]}</div><h3>${b.name}</h3><p>${b.specialty}</p><span class="role">Único profissional • agenda online</span></article>`).join('');
 $('#serviceSelect').innerHTML='<option value="">Selecione...</option>'+services.map(s=>`<option value="${s.id}">${s.name} — ${money(s.price)} • ${s.duration} min</option>`).join('');
 $('#barberSelect').innerHTML='<option value="liedson" selected>Liedson</option>';
 $('#barberSelect').disabled=true;
}
function openModal(id){$(id).classList.add('show');$(id).setAttribute('aria-hidden','false')}
function closeModal(id){$(id).classList.remove('show');$(id).setAttribute('aria-hidden','true')}
let step=1;
function setStep(n){step=n;$$('.form-step').forEach(x=>x.classList.toggle('active',+x.dataset.step===n));$$('[data-dot]').forEach(x=>x.classList.toggle('active',+x.dataset.dot<=n));if(n===3)summary()}
function resetBooking(){$('#bookingForm').reset();$('#barberSelect').value='liedson';$('#slots').innerHTML='';$('#timeInput').value='';setStep(1)}
async function getBusy(date){
 const res=await fetch(API+'?date='+encodeURIComponent(date),{headers:{apikey:API_KEY}});
 if(!res.ok) throw new Error('Não foi possível consultar a agenda.');
 const data=await res.json();
 return data.busy||[];
}
function overlaps(start,duration,busy){
 const a=toMinutes(start),b=a+duration;
 return busy.some(x=>a<(x.start_minute+x.duration_minutes)&&b>x.start_minute);
}
async function slots(){
 const date=$('#dateInput').value;
 const service=services.find(s=>s.id===$('#serviceSelect').value);
 $('#timeInput').value='';
 if(!date||!service){$('#slots').innerHTML='<span class="muted">Escolha o serviço e a data.</span>';return}
 if(new Date(date+'T12:00:00').getDay()===0){$('#slots').innerHTML='<span class="muted">Fechado aos domingos.</span>';return}
 $('#slots').innerHTML='<span class="muted">Consultando agenda...</span>';
 try{
   const busy=await getBusy(date);
   const opening=9*60,closing=19*60,interval=50,all=[];
   for(let start=opening;start+service.duration<=closing;start+=interval) all.push(fromMinutes(start));
   $('#slots').innerHTML=all.map(t=>`<button type="button" class="slot ${overlaps(t,service.duration,busy)?'busy':''}" data-time="${t}">${t}</button>`).join('');
   $$('.slot:not(.busy)').forEach(b=>b.onclick=()=>{$$('.slot').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');$('#timeInput').value=b.dataset.time});
   if(!$$('.slot:not(.busy)').length) $('#slots').innerHTML='<span class="muted">Não há horários disponíveis para este dia.</span>';
 }catch(err){$('#slots').innerHTML='<span class="muted">Não foi possível carregar os horários. Tente novamente.</span>'}
}
function summary(){
 const s=services.find(x=>x.id===$('#serviceSelect').value);
 $('#summary').innerHTML=`<strong>Resumo</strong><br>${s?.name||''} • ${money(s?.price||0)} • ${s?.duration||''} min<br>Profissional: Liedson<br>${fmtDate($('#dateInput').value)} às ${$('#timeInput').value}`;
}
function valid(){
 if(step===1&&!$('#serviceSelect').value){alert('Selecione o serviço.');return false}
 if(step===2&&(!$('#dateInput').value||!$('#timeInput').value)){alert('Escolha a data e um horário disponível.');return false}
 return true
}
function renderAdmin(){
 const items=getLocal().sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
 $('#appointmentList').innerHTML=items.length?items.map(a=>{
   const s=services.find(x=>x.id===a.service);
   return`<div class="appointment"><div><strong>${fmtDate(a.date)} • ${a.time} — ${a.name}</strong><small>${s?.name||a.service} com Liedson • ${a.duration||s?.duration||50} min<br>${a.phone}</small></div></div>`
 }).join(''):'<div class="empty">Nenhum agendamento confirmado neste navegador.</div>';
}
$$('[data-book]').forEach(b=>b.onclick=()=>{resetBooking();openModal('#bookingModal')});
$('[data-close-book]').onclick=()=>closeModal('#bookingModal');
$$('[data-next]').forEach(b=>b.onclick=()=>{if(valid())setStep(Math.min(3,step+1))});
$$('[data-back]').forEach(b=>b.onclick=()=>setStep(Math.max(1,step-1)));
$('#dateInput').onchange=slots;
$('#serviceSelect').onchange=()=>{if($('#dateInput').value)slots()};
const now=new Date(),min=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');$('#dateInput').min=min;
$('#bookingForm').onsubmit=async e=>{
 e.preventDefault();
 const s=services.find(x=>x.id===$('#serviceSelect').value);
 const a={service:s.id,date:$('#dateInput').value,time:$('#timeInput').value,name:$('#nameInput').value.trim(),phone:$('#phoneInput').value.trim()};
 const submit=e.submitter; if(submit){submit.disabled=true;submit.textContent='Confirmando...'}
 try{
   const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',apikey:API_KEY},body:JSON.stringify(a)});
   const data=await res.json();
   if(!res.ok) throw new Error(data.error||'Não foi possível concluir o agendamento.');
   const confirmed={...a,id:data.appointment?.id||String(Date.now()),barber:'liedson',duration:s.duration};
   const local=getLocal();local.push(confirmed);saveLocal(local);
   $('#successText').textContent=`${a.name}, seu ${s.name} com Liedson está marcado para ${fmtDate(a.date)} às ${a.time}. Esse horário já foi bloqueado para todos os clientes.`;
   closeModal('#bookingModal');openModal('#successModal');
 }catch(err){
   alert(err.message||'Não foi possível concluir o agendamento.');
   setStep(2);await slots();
 }finally{if(submit){submit.disabled=false;submit.textContent='Confirmar'}}
};
$('[data-close-success]').onclick=()=>closeModal('#successModal');
$('#adminOpen').onclick=()=>{openModal('#adminModal');$('#adminLogin').classList.remove('hidden');$('#adminPanel').classList.add('hidden')};
$('[data-close-admin]').onclick=()=>closeModal('#adminModal');
$('#loginForm').onsubmit=e=>{e.preventDefault();if($('#adminEmail').value==='admin@barbearia.com'&&$('#adminPass').value==='123456'){$('#adminLogin').classList.add('hidden');$('#adminPanel').classList.remove('hidden');renderAdmin()}else alert('E-mail ou senha incorretos.')};
$('#logout').onclick=()=>{$('#adminPanel').classList.add('hidden');$('#adminLogin').classList.remove('hidden');$('#loginForm').reset()};
$$('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('show')}));
$('#year').textContent=new Date().getFullYear();render();