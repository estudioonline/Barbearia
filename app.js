const services=[
{id:'nevou',name:'NEVOU',desc:'Atendimento de longa duração.',price:100,duration:300},
{id:'luzes',name:'LUZES',desc:'Atendimento de longa duração.',price:80,duration:300}
];
const barbers=[{id:'liedson',name:'Liedson',specialty:'Proprietário e barbeiro • cortes, barba e acabamento'}];
const API='https://hncpyfvyffawdveidikl.supabase.co/functions/v1/barbearia-booking';
const API_KEY='sb_publishable_vuoGNU0lSuM9Trm7RqCoQQ_LyedLwMb';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const money=n=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtDate=v=>new Date(v+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'});
const toMinutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m};
const fromMinutes=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const LAST_BOOKING_KEY='barbearia_liedson_last_booking';
const saveLastBooking=data=>localStorage.setItem(LAST_BOOKING_KEY,JSON.stringify(data));
const getLastBooking=()=>{try{return JSON.parse(localStorage.getItem(LAST_BOOKING_KEY)||'null')}catch{return null}};
function renderLastBooking(){
 const box=$('#bookingPreview'); if(!box) return;
 const booking=getLastBooking();
 if(!booking){box.innerHTML='<strong>Agendamento</strong><p>Nenhum agendamento confirmado ainda.</p>';return}
 box.innerHTML=`<strong>Agendamento</strong><p><b>${booking.name}</b><br>${booking.service}<br>${fmtDate(booking.date)} às ${booking.time}</p>`;
}
let adminPin='';

function render(){
 $('#serviceSelect').innerHTML='<option value="">Selecione...</option>'+services.map(s=>`<option value="${s.id}">${s.name} — ${money(s.price)} • ${s.duration} min</option>`).join('');
}
function openModal(id){$(id).classList.add('show');$(id).setAttribute('aria-hidden','false')}
function closeModal(id){$(id).classList.remove('show');$(id).setAttribute('aria-hidden','true')}
let step=1;
function setStep(n){step=n;$$('.form-step').forEach(x=>x.classList.toggle('active',+x.dataset.step===n));$$('[data-dot]').forEach(x=>x.classList.toggle('active',+x.dataset.dot<=n));if(n===3)summary()}
function resetBooking(){render();$('#bookingForm').reset();$('#slots').innerHTML='';$('#timeInput').value='';setStep(1)}
async function api(body){
 const res=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',apikey:API_KEY},body:JSON.stringify(body)});
 const data=await res.json();
 if(!res.ok) throw new Error(data.error||'Não foi possível concluir a operação.');
 return data;
}
async function getBusy(date){
 const res=await fetch(API+'?date='+encodeURIComponent(date),{headers:{apikey:API_KEY}});
 if(!res.ok) throw new Error('Não foi possível consultar a agenda.');
 const data=await res.json(); return data;
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
 const d=new Date(date+'T12:00:00');
 const month=d.getMonth()+1, day=d.getDate(), dow=d.getDay();
 if(month!==12){$('#slots').innerHTML='<span class="muted">NEVOU e LUZES estão disponíveis somente em dezembro.</span>';return}
 if(dow===0||dow===1){$('#slots').innerHTML='<span class="muted">Não há atendimento aos domingos e segundas-feiras.</span>';return}
 if(day===25){$('#slots').innerHTML='<span class="muted">Não há atendimento no dia 25 de dezembro.</span>';return}
 $('#slots').innerHTML='<span class="muted">Consultando agenda...</span>';
 try{
   const availability=await getBusy(date);
   if(availability.full){$('#slots').innerHTML='<span class="muted">Este dia já atingiu o limite de 4 atendimentos. Escolha outra data.</span>';return}
   const counts=availability.slotCounts||{"08:00":0,"13:00":0};
   const all=["08:00","13:00"];
   $('#slots').innerHTML=all.map(t=>{
     const used=counts[t]||0;
     const full=used>=2;
     const left=Math.max(0,2-used);
     return `<button type="button" class="slot ${full?'busy':''}" data-time="${t}" ${full?'disabled':''}><strong>${t}</strong><small>${full?'Lotado':left+' vaga'+(left===1?'':'s')}</small></button>`;
   }).join('');
   $('.slot:not(.busy)').forEach(b=>b.onclick=()=>{$('.slot').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');$('#timeInput').value=b.dataset.time});
   if(!$$('.slot:not(.busy)').length) $('#slots').innerHTML='<span class="muted">As 4 vagas deste dia já foram preenchidas. Escolha outra data.</span>';
 }catch{$('#slots').innerHTML='<span class="muted">Não foi possível carregar os horários. Tente novamente.</span>'}
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
async function loadAdmin(){
 $('#appointmentList').innerHTML='<div class="empty">Carregando agenda...</div>';
 try{
   const data=await api({action:'admin-list',pin:adminPin});
   const items=data.appointments||[];
   $('#appointmentList').innerHTML=items.length?items.map(a=>{
     const s=services.find(x=>x.id===a.service_id);
     const time=fromMinutes(a.start_minute);
     const done=a.status==='concluido';
     const cancelled=a.status==='cancelado';
     const statusText=done?'Concluído':cancelled?'Cancelado':'Agendado';
     const statusClass=done?'done':cancelled?'cancelled':'pending';
     return `<div class="appointment ${done?'completed':cancelled?'cancelled-row':''}">
       <div>
         <div class="appt-top"><strong>${fmtDate(a.appointment_date)} • ${time} — ${a.customer_name}</strong><span class="status ${statusClass}">${statusText}</span></div>
         <small>${s?.name||a.service_id} • ${a.duration_minutes} min<br>WhatsApp: ${a.phone}</small>
       </div>
       ${done||cancelled?'':`<div class="admin-actions"><button class="complete-btn" data-complete="${a.id}">Concluir</button><button class="cancel-btn" data-cancel="${a.id}" data-phone="${a.phone}" data-name="${a.customer_name}" data-date="${a.appointment_date}" data-time="${time}" data-service="${s?.name||a.service_id}">Cancelar</button></div>`}
     </div>`;
   }).join(''):'<div class="empty">Nenhum agendamento encontrado.</div>';
   $$('[data-complete]').forEach(btn=>btn.onclick=async()=>{
     if(!confirm('Marcar este atendimento como concluído?')) return;
     btn.disabled=true;btn.textContent='Salvando...';
     try{await api({action:'complete',pin:adminPin,id:btn.dataset.complete});await loadAdmin()}
     catch(err){alert(err.message);btn.disabled=false;btn.textContent='Concluir'}
   });
   $$('[data-cancel]').forEach(btn=>btn.onclick=async()=>{
     if(!confirm('Cancelar este agendamento? O horário ficará disponível novamente.')) return;
     btn.disabled=true;btn.textContent='Cancelando...';
     try{
       await api({action:'cancel',pin:adminPin,id:btn.dataset.cancel});
       let phone=String(btn.dataset.phone||'').replace(/\D/g,'');
       if(phone.length===10||phone.length===11) phone='55'+phone;
       const msg=`Olá, ${btn.dataset.name}. Aqui é da Barbearia Liedson. Seu agendamento de ${btn.dataset.service} para ${fmtDate(btn.dataset.date)} às ${btn.dataset.time} precisou ser cancelado. Pedimos desculpas pelo transtorno.`;
       await loadAdmin();
       if(phone) window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg),'_blank');
     }catch(err){
       alert(err.message);btn.disabled=false;btn.textContent='Cancelar';
     }
   });
 }catch(err){
   $('#appointmentList').innerHTML=`<div class="empty">${err.message}</div>`;
 }
}
$$('[data-book]').forEach(b=>b.onclick=()=>{resetBooking();openModal('#bookingModal')});
$('[data-close-book]').onclick=()=>closeModal('#bookingModal');
$$('[data-next]').forEach(b=>b.onclick=()=>{if(valid())setStep(Math.min(3,step+1))});
$$('[data-back]').forEach(b=>b.onclick=()=>setStep(Math.max(1,step-1)));
$('#dateInput').onchange=slots;
$('#serviceSelect').onchange=()=>{if($('#dateInput').value)slots()};
const now=new Date();
const targetYear=now.getMonth()===11?now.getFullYear():now.getFullYear();
$('#dateInput').min=`${targetYear}-12-01`;
$('#dateInput').max=`${targetYear}-12-31`;
$('#bookingForm').onsubmit=async e=>{
 e.preventDefault();
 const s=services.find(x=>x.id===$('#serviceSelect').value);
 const a={service:s.id,date:$('#dateInput').value,time:$('#timeInput').value,name:$('#nameInput').value.trim(),phone:$('#phoneInput').value.trim()};
 const submit=e.submitter;if(submit){submit.disabled=true;submit.textContent='Confirmando...'}
 try{
   await api(a);
   saveLastBooking({name:a.name,service:s.name,date:a.date,time:a.time});
   renderLastBooking();
   $('#successText').textContent=`${a.name}, seu ${s.name} na Barbearia Liedson está agendado para ${fmtDate(a.date)} às ${a.time}. Seu horário foi reservado com sucesso.`;
   closeModal('#bookingModal');openModal('#successModal');
 }catch(err){alert(err.message);setStep(2);await slots()}
 finally{if(submit){submit.disabled=false;submit.textContent='Confirmar'}}
};
$('[data-close-success]').onclick=()=>closeModal('#successModal');
const openAdmin=()=>{openModal('#adminModal');$('#adminLogin').classList.remove('hidden');$('#adminPanel').classList.add('hidden');$('#loginForm').reset()};
$('#adminOpen').onclick=openAdmin;
$('[data-close-admin]').onclick=()=>closeModal('#adminModal');
$('#loginForm').onsubmit=async e=>{
 e.preventDefault();
 const pin=$('#adminPin').value.trim();
 try{
   adminPin=pin;
   const data=await api({action:'admin-list',pin});
   $('#adminLogin').classList.add('hidden');$('#adminPanel').classList.remove('hidden');
   const items=data.appointments||[];
   await loadAdmin();
 }catch(err){adminPin='';alert(err.message)}
};
$('#clearAgenda').onclick=async()=>{
  if(!confirm('Tem certeza que deseja limpar toda a agenda? Todos os horários serão liberados.')) return;
  const btn=$('#clearAgenda'); btn.disabled=true; btn.textContent='Limpando...';
  try{
    await api({action:'clear-all',pin:adminPin});
    localStorage.removeItem(LAST_BOOKING_KEY);
    renderLastBooking();
    await loadAdmin();
    alert('Agenda limpa com sucesso.');
  }catch(err){
    alert(err.message||'Não foi possível limpar a agenda.');
  }finally{
    btn.disabled=false; btn.textContent='Limpar agenda';
  }
};
$('#logout').onclick=()=>{adminPin='';$('#adminPanel').classList.add('hidden');$('#adminLogin').classList.remove('hidden');$('#loginForm').reset()};
$$('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('show')}));
$('#year').textContent=new Date().getFullYear();render();renderLastBooking();