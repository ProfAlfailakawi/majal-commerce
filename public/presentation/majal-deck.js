// Slide rail and keyboard navigation for majal-deck.html (external so script-src 'self' allows it).
(function(){
  var deck=document.getElementById('deck');
  var slides=[].slice.call(deck.querySelectorAll('.slide'));
  var rail=document.querySelector('.rail'), cur=document.getElementById('cur'), tot=document.getElementById('tot');
  var ar=function(n){return String(n).replace(/\d/g,function(d){return '0123456789'[d];});};
  tot.textContent=ar(slides.length);
  slides.forEach(function(s,i){
    var b=document.createElement('button');
    b.type='button'; b.setAttribute('aria-label', s.dataset.label||('الشريحة '+(i+1)));
    b.appendChild(document.createElement('i'));
    b.addEventListener('click',function(){ s.scrollIntoView({behavior:'smooth',block:'start'}); });
    rail.appendChild(b);
  });
  var dots=[].slice.call(rail.children), active=-1;
  function setActive(i){ if(i===active||i<0)return; active=i;
    dots.forEach(function(d,j){ d.setAttribute('aria-current', j===i?'true':'false'); });
    cur.textContent=ar(i+1);
  }
  setActive(0);
  var io=new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting&&e.intersectionRatio>0.5) setActive(slides.indexOf(e.target)); });
  },{root:deck,threshold:[0.51]});
  slides.forEach(function(s){ io.observe(s); });
  document.addEventListener('keydown',function(e){
    var n=null;
    if(e.key==='ArrowDown'||e.key==='PageDown'||e.key===' '||e.key==='ArrowLeft') n=active+1;
    else if(e.key==='ArrowUp'||e.key==='PageUp'||e.key==='ArrowRight') n=active-1;
    else if(e.key==='Home') n=0; else if(e.key==='End') n=slides.length-1; else return;
    e.preventDefault();
    if(n<0||n>=slides.length) return;
    slides[n].scrollIntoView({behavior:'smooth',block:'start'});
  });
})();
