(()=>{
  const pad=value=>String(value).padStart(2,'0');
  const toValue=date=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const parse=value=>{const date=value?new Date(value):new Date(Date.now()+86400000);return Number.isNaN(date.getTime())?new Date():date};
  const display=date=>date.toLocaleString(undefined,{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  window.initDateTimePicker=input=>{
    if(!input||input.dataset.googlePicker)return;
    input.dataset.googlePicker='true';input.type='text';input.readOnly=true;input.classList.add('google-date-time-input');input.placeholder='Select date and time';
    let selected=parse(input.value),view=new Date(selected.getFullYear(),selected.getMonth(),1);
    const dialog=document.createElement('dialog');dialog.className='google-date-time-picker';dialog.innerHTML=`<form method="dialog"><h2>Select date and time</h2><div class="gdt-body"><section><div class="gdt-month"><strong></strong><span><button type="button" data-prev aria-label="Previous month">‹</button><button type="button" data-next aria-label="Next month">›</button></span></div><div class="gdt-weekdays"></div><div class="gdt-days"></div></section><div class="gdt-fields"><label>Date<input data-date readonly></label><label>Time<input data-time type="time" step="300"></label></div></div><div class="gdt-actions"><button value="cancel">Cancel</button><button class="gdt-save" value="default">Save</button></div></form>`;
    document.body.append(dialog);
    const month=dialog.querySelector('.gdt-month strong'),days=dialog.querySelector('.gdt-days'),dateField=dialog.querySelector('[data-date]'),timeField=dialog.querySelector('[data-time]'),weekdays=dialog.querySelector('.gdt-weekdays');
    ['M','T','W','T','F','S','S'].forEach(day=>{const span=document.createElement('span');span.textContent=day;weekdays.append(span)});
    const render=()=>{month.textContent=view.toLocaleDateString(undefined,{month:'long',year:'numeric'});dateField.value=selected.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'});timeField.value=`${pad(selected.getHours())}:${pad(selected.getMinutes())}`;days.replaceChildren();const first=(new Date(view.getFullYear(),view.getMonth(),1).getDay()+6)%7,last=new Date(view.getFullYear(),view.getMonth()+1,0).getDate(),previous=new Date(view.getFullYear(),view.getMonth(),0).getDate();for(let cell=0;cell<42;cell++){const day=cell-first+1,button=document.createElement('button');button.type='button';let date;if(day<1){date=new Date(view.getFullYear(),view.getMonth()-1,previous+day);button.className='outside'}else if(day>last){date=new Date(view.getFullYear(),view.getMonth()+1,day-last);button.className='outside'}else date=new Date(view.getFullYear(),view.getMonth(),day);button.textContent=date.getDate();if(date.toDateString()===new Date().toDateString())button.classList.add('today');if(date.toDateString()===selected.toDateString())button.classList.add('selected');button.onclick=()=>{selected.setFullYear(date.getFullYear(),date.getMonth(),date.getDate());view=new Date(date.getFullYear(),date.getMonth(),1);render()};days.append(button)}};
    dialog.querySelector('[data-prev]').onclick=()=>{view.setMonth(view.getMonth()-1);render()};dialog.querySelector('[data-next]').onclick=()=>{view.setMonth(view.getMonth()+1);render()};
    input.addEventListener('click',()=>{selected=parse(input.dataset.value||input.value);view=new Date(selected.getFullYear(),selected.getMonth(),1);render();dialog.showModal()});
    dialog.addEventListener('close',()=>{if(dialog.returnValue==='default'){const [hours,minutes]=(timeField.value||'00:00').split(':').map(Number);selected.setHours(hours,minutes,0,0);input.dataset.value=toValue(selected);input.value=display(selected);input.dispatchEvent(new Event('change',{bubbles:true}))}});
    Object.defineProperty(input,'dateTimeValue',{get:()=>input.dataset.value||'',set:value=>{input.dataset.value=value||'';input.value=value?display(parse(value)):''}});
    const initial=input.getAttribute('value');if(initial)input.dateTimeValue=initial;
  };
})();
