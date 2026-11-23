/*
 * حركة شريط التنقّل — بصرية فقط، لا تمسّ التنقّل نفسه.
 *
 * 1) مؤشّرٌ واحد للوجهة النشطة ينزلق بين الأيقونات (يتمدّد قليلًا في الطريق ثم يستقرّ)،
 *    ولا يتحرّك إلا بعد أن تتغيّر الوجهة فعلًا (يراقب الصنف النشط، لا النقرة).
 * 2) ضغطةٌ فورية خفيفة تحت الإصبع، وعودةٌ ناعمة عند الرفع أو الإلغاء.
 * 3) حين يتغيّر شكل الشريط (تدوير، فتح الدوو أو طيّه): الكبسولة تنفرد إلى شريط أو العكس،
 *    وكل أيقونة تسافر إلى مكانها الجديد بدل أن تختفي وتظهر.
 * 4) يتنحّى عن لوحة المفاتيح ويعود بعدها.
 * «تقليل الحركة» يجعل كل ذلك فوريًّا. الألوان من متغيّرات CSS لكل موقع (--dm-ind-*).
 */
export type DockMotionOptions = {
  /** محدِّد الشريط نفسه */
  dock: string;
  /** محدِّد كل زرّ أو رابط في الشريط */
  link: string;
  /** محدِّد الزرّ النشط داخل الشريط */
  active: string;
};

type Box = { x: number; y: number; w: number; h: number };

const EASE = "cubic-bezier(.32,.72,0,1)";
const MOVE_MS = 380;
const SHAPE_MS = 420;

const reduced = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;


/* القياس بمقاييس التخطيط (offset*) لا بـgetBoundingClientRect: فلا يتأثّر بتحويلٍ جارٍ على الشريط
   (إخفاءٌ بالتمرير، أو حركة الضغط والانتقال نفسها) فلا يقفز المؤشّر. */
function local(el: HTMLElement, dock: HTMLElement): Box {
  if (el.offsetParent === dock) return { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  let x = 0, y = 0, n: HTMLElement | null = el;
  while (n && n !== dock) {
    x += n.offsetLeft; y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  if (n === dock) return { x, y, w: el.offsetWidth, h: el.offsetHeight };
  const r = el.getBoundingClientRect(), d = dock.getBoundingClientRect();
  return { x: r.left - d.left - dock.clientLeft, y: r.top - d.top - dock.clientTop, w: r.width, h: r.height };
}

/** موضع الشريط على الشاشة دون تحويلاته. */
function dockLayout(dock: HTMLElement): Box {
  let x = 0, y = 0, n: HTMLElement | null = dock;
  while (n) {
    x += n.offsetLeft - (n === dock ? 0 : n.scrollLeft);
    y += n.offsetTop - (n === dock ? 0 : n.scrollTop);
    n = n.offsetParent as HTMLElement | null;
  }
  if (getComputedStyle(dock).position !== "fixed") { x -= scrollX; y -= scrollY; }
  return { x, y, w: dock.offsetWidth, h: dock.offsetHeight };
}

function visible(el: HTMLElement) {
  return el.offsetWidth > 0 && el.offsetHeight > 0 && getComputedStyle(el).visibility !== "hidden";
}

function attach(dock: HTMLElement, o: DockMotionOptions) {
  dock.dataset.dm = "1";
  // لا نكتب موضع الشريط في سطره: قاعدةٌ مضمَّنة كانت ستغلب «fixed» في صفحات الموقع. الموقع يضمن أن الشريط مُموضَع.

  const ind = document.createElement("span");
  ind.className = "dm-ind";
  ind.setAttribute("aria-hidden", "true");
  dock.prepend(ind);

  let indBox: Box | null = null;
  let dockBox: Box | null = visible(dock) ? dockLayout(dock) : null;
  let linkBoxes = new Map<HTMLElement, Box>();
  let moveAnim: Animation | null = null;

  const links = () => Array.from(dock.querySelectorAll<HTMLElement>(o.link));
  const remember = () => {
    linkBoxes = new Map(links().map((l) => [l, local(l, dock)]));
    dockBox = visible(dock) ? dockLayout(dock) : null;
  };

  const setInd = (b: Box) => {
    ind.style.left = `${b.x}px`;
    ind.style.top = `${b.y}px`;
    ind.style.width = `${b.w}px`;
    ind.style.height = `${b.h}px`;
  };

  /** يضع المؤشّر تحت الزرّ النشط؛ animate=false يضعه فورًا. */
  const place = (animate: boolean) => {
    const act = dock.querySelector<HTMLElement>(o.active);
    if (!act || !visible(dock)) {
      ind.style.opacity = "0";
      indBox = null;
      return;
    }
    const to = local(act, dock);
    const from = indBox;
    indBox = to;
    setInd(to);
    const wasHidden = ind.style.opacity === "0";
    ind.style.opacity = "1";
    moveAnim?.cancel();
    if (!animate || !from || reduced()) {
      if (wasHidden && !reduced()) ind.animate([{ opacity: 0, transform: "scale(.86)" }, { opacity: 1, transform: "none" }], { duration: 220, easing: EASE });
      return;
    }
    if (Math.abs(from.x - to.x) < 1 && Math.abs(from.y - to.y) < 1 && Math.abs(from.w - to.w) < 1) return;
    // في منتصف الطريق يمتدّ المؤشّر فوق المسافة بين الزرّين ويرقّ قليلًا، ثم ينكمش على وجهته.
    const x0 = Math.min(from.x, to.x), y0 = Math.min(from.y, to.y);
    const x1 = Math.max(from.x + from.w, to.x + to.w), y1 = Math.max(from.y + from.h, to.y + to.h);
    const horiz = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y);
    const mid: Box = horiz
      ? { x: x0 + (x1 - x0) * 0.08, y: to.y + to.h * 0.06, w: (x1 - x0) * 0.84, h: to.h * 0.88 }
      : { x: to.x + to.w * 0.06, y: y0 + (y1 - y0) * 0.08, w: to.w * 0.88, h: (y1 - y0) * 0.84 };
    const kf = (b: Box, offset?: number) => ({ left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px`, ...(offset == null ? {} : { offset }) });
    moveAnim = ind.animate([kf(from), kf(mid, 0.42), kf(to)], { duration: MOVE_MS, easing: EASE });
  };

  /** تغيّر شكل الشريط أو موضعه: كل أيقونة تنتقل من مكانها السابق، والشريط ينفرد من حدوده السابقة. */
  const reflow = () => {
    const prevLinks = linkBoxes;
    const prevDock = dockBox;
    const prevInd = indBox;
    remember();
    const nowDock = dockBox;
    if (!prevDock || !nowDock || reduced()) {
      place(false);
      return;
    }
    const moved = Math.abs(prevDock.x - nowDock.x) + Math.abs(prevDock.y - nowDock.y) + Math.abs(prevDock.w - nowDock.w) + Math.abs(prevDock.h - nowDock.h);
    if (moved < 3) {
      place(true);
      return;
    }
    const reshaped = Math.abs(prevDock.w - nowDock.w) > 24 || Math.abs(prevDock.h - nowDock.h) > 24;
    // الشريط: يبدأ من حدوده القديمة (قصٌّ مستدير) ثم يتّسع أو ينكمش إلى حدوده الجديدة.
    const dx = prevDock.x - nowDock.x, dy = prevDock.y - nowDock.y;
    if (reshaped) {
      const radius = getComputedStyle(dock).borderTopLeftRadius || "0px";
      const t = Math.max(0, prevDock.y - nowDock.y), l = Math.max(0, prevDock.x - nowDock.x);
      const b = Math.max(0, nowDock.y + nowDock.h - (prevDock.y + prevDock.h));
      const r = Math.max(0, nowDock.x + nowDock.w - (prevDock.x + prevDock.w));
      dock.animate(
        [{ clipPath: `inset(${t}px ${r}px ${b}px ${l}px round ${radius})` }, { clipPath: `inset(0px 0px 0px 0px round ${radius})` }],
        { duration: SHAPE_MS, easing: EASE },
      );
    } else {
      dock.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: SHAPE_MS, easing: EASE });
    }
    // الأيقونات: من موضعها القديم على الشاشة إلى الجديد.
    for (const [l, now] of linkBoxes) {
      const was = prevLinks.get(l);
      if (!was) continue;
      const ox = reshaped ? prevDock.x + was.x - (nowDock.x + now.x) : was.x - now.x;
      const oy = reshaped ? prevDock.y + was.y - (nowDock.y + now.y) : was.y - now.y;
      if (Math.abs(ox) < 1 && Math.abs(oy) < 1) continue;
      l.animate([{ transform: `translate(${ox}px,${oy}px)` }, { transform: "none" }], { duration: SHAPE_MS, easing: EASE });
    }
    // المؤشّر يسافر مع أيقونته.
    const act = dock.querySelector<HTMLElement>(o.active);
    if (act && prevInd && reshaped) {
      const to = local(act, dock);
      indBox = to;
      setInd(to);
      ind.style.opacity = "1";
      const from: Box = { x: prevDock.x + prevInd.x - nowDock.x, y: prevDock.y + prevInd.y - nowDock.y, w: prevInd.w, h: prevInd.h };
      moveAnim?.cancel();
      moveAnim = ind.animate(
        [{ left: `${from.x}px`, top: `${from.y}px`, width: `${from.w}px`, height: `${from.h}px` }, { left: `${to.x}px`, top: `${to.y}px`, width: `${to.w}px`, height: `${to.h}px` }],
        { duration: SHAPE_MS, easing: EASE },
      );
    } else {
      place(false);
    }
  };

  // ── الضغط: فوريّ عند اللمس، ويعود بنعومة عند الرفع أو خروج الإصبع (المتصفّح نفسه يلغي النقرة حينها). ──
  let pressed: HTMLElement | null = null;
  const release = () => {
    if (!pressed) return;
    pressed.classList.remove("dm-press");
    ind.classList.remove("dm-press");
    pressed = null;
  };
  dock.addEventListener("pointerdown", (e) => {
    const l = (e.target as Element).closest<HTMLElement>(o.link);
    if (!l || !dock.contains(l)) return;
    release();
    pressed = l;
    l.classList.add("dm-press");
    if (l.matches(o.active)) ind.classList.add("dm-press");
  }, { passive: true });
  for (const ev of ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"]) dock.addEventListener(ev, release, { passive: true });
  addEventListener("blur", release);

  // ── الوجهة النشطة: المؤشّر يتبع تغيّر الصنف بعد قبول التنقّل، والنقرات المتتابعة تستقرّ على آخرها. ──
  let raf = 0;
  const schedule = (fn: () => void) => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fn);
  };
  new MutationObserver(() => schedule(() => {
    if (!ind.isConnected) dock.prepend(ind);
    linkBoxes = new Map(links().map((l) => [l, local(l, dock)]));
    place(true);
  })).observe(dock, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "aria-current"] });

  // ── الشكل والمقاس: تدوير، فتح أو طيّ، تغيّر المساحة. ──
  let shapeRaf = 0;
  const onShape = () => {
    cancelAnimationFrame(shapeRaf);
    shapeRaf = requestAnimationFrame(() => requestAnimationFrame(reflow));
  };
  new ResizeObserver(onShape).observe(dock);
  addEventListener("resize", onShape, { passive: true });
  addEventListener("orientationchange", onShape, { passive: true });

  // ── لوحة المفاتيح: يتنحّى الشريط ما دام حقلٌ نشطًا والمساحة المرئية تقلّصت. ──
  const vv = window.visualViewport;
  const kb = () => {
    const a = document.activeElement as HTMLElement | null;
    const typing = !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && !/^(checkbox|radio|button|submit|range|color|file)$/.test((a as HTMLInputElement).type || "");
    const shrunk = !!vv && vv.height < innerHeight * 0.78;
    dock.classList.toggle("dm-kb", typing && shrunk);
  };
  vv?.addEventListener("resize", kb, { passive: true });
  document.addEventListener("focusin", () => setTimeout(kb, 60));
  document.addEventListener("focusout", () => setTimeout(kb, 60));

  remember();
  place(false);
  dock.dataset.dmReady = "1";
}

export function installDockMotion(o: DockMotionOptions) {
  if (typeof window === "undefined" || typeof ResizeObserver === "undefined" || !("animate" in Element.prototype)) return;
  const seen = new WeakSet<Element>();
  const scan = () => {
    document.querySelectorAll<HTMLElement>(o.dock).forEach((d) => {
      if (seen.has(d)) return;
      seen.add(d);
      attach(d, o);
    });
  };
  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
}
