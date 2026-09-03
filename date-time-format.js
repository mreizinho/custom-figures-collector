const DATE_FORMAT_KEY='minifig-date-format';
const TIME_FORMAT_KEY='minifig-time-hour12';
const dateFormat=()=>localStorage.getItem(DATE_FORMAT_KEY)||'D MMM YYYY';
const hour12=()=>{const stored=localStorage.getItem(TIME_FORMAT_KEY)??localStorage.getItem('releaseCalendarHour12');return stored===null?new Intl.DateTimeFormat(undefined,{hour:'numeric'}).resolvedOptions().hour12:stored==='true'};
const month=date=>new Intl.DateTimeFormat(undefined,{month:'short'}).format(date).replace('.','').toUpperCase();
const formatDate=date=>{const d=date.getDate(),dd=String(d).padStart(2,'0'),m=date.getMonth()+1,mm=String(m).padStart(2,'0'),yyyy=date.getFullYear();switch(dateFormat()){case'DD/MM/YYYY':return`${dd}/${mm}/${yyyy}`;case'MM/DD/YYYY':return`${mm}/${dd}/${yyyy}`;case'YYYY-MM-DD':return`${yyyy}-${mm}-${dd}`;default:return`${d} ${month(date)} ${yyyy}`}};
const formatTime=date=>new Intl.DateTimeFormat(undefined,{hour:'2-digit',minute:'2-digit',hour12:hour12()}).format(date);
window.collectorDateTime={dateFormat,hour12,month,formatDate,formatTime};

const displayPanel=document.querySelector('[data-settings-panel="display"]');
if(displayPanel){
  const section=document.createElement('section');section.className='date-time-format-setting';section.innerHTML='<h3>Date and time</h3><div class="date-time-format-controls"><label>Date format<select data-date-format><option>D MMM YYYY</option><option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option></select></label><label>Time format<select data-time-format><option value="false">24-hour</option><option value="true">12-hour</option></select></label></div><p>Used consistently throughout the calendar and date/time fields.</p>';displayPanel.append(section);
  const dateSelect=section.querySelector('[data-date-format]'),timeSelect=section.querySelector('[data-time-format]');dateSelect.value=dateFormat();timeSelect.value=String(hour12());
  const save=()=>{localStorage.setItem(DATE_FORMAT_KEY,dateSelect.value);localStorage.setItem(TIME_FORMAT_KEY,timeSelect.value);window.dispatchEvent(new Event('collector-date-time-format-change'))};dateSelect.onchange=save;timeSelect.onchange=save;
}

const syncPremiumPromotion=()=>{const promotion=document.querySelector('.premium-upgrade-setting');if(promotion)promotion.hidden=Boolean(window.collectorPremiumUser)};
window.addEventListener('collector-google-auth',syncPremiumPromotion);
new MutationObserver(syncPremiumPromotion).observe(document.body,{childList:true,subtree:true});
syncPremiumPromotion();
