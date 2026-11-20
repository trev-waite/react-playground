import { clamp, flightOrder, flightPose, FLIGHT_SPAN, followScroll, letterDeparture, LETTERS, liftScale, SETTLE_MS, springOffset, type Pose } from "./scene";
import { connectScrubber } from "./scrubber";
import { prepareGlyphArt } from "./glyphArt";

type Point = { x: number; y: number };
type Space = Point & { unit: number };
type Press = { index: number; id: number; point: Point; parkedAt: number | null };
type Grab = {
  index: number;
  id: number | null;
  start: number;
  from: Pose;
  restingScale: number;
  point: Point;
  space: Space;
  anchor: Point;
  velocity: Point;
  moved: number;
};
type Return = { start: number; offset: Pose; velocity: Point };
type Playback = { phase: "rewind" | "advance"; paused: boolean };

const STILL = { x: 0, y: 0 };
const TOUCH_HOLD_MS = 170;
const TOUCH_SLOP = 8;
const WHEEL_PAUSE_MS = 160;
const PLAYBACK_MS = 2100;
const ACTIVE_DEPTH = 24;
const WORD_DEPTH = 12;
const FIRST_DEPARTURE = letterDeparture(0, LETTERS.length);
const TITLE_ARRIVAL = letterDeparture(LETTERS.length - 1, LETTERS.length) + FLIGHT_SPAN;
const PAGE_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", " "]);

function eventPoint(event: MouseEvent | Touch): Point {
  return { x: event.clientX, y: event.clientY };
}

function readSpace(group: HTMLElement, button: HTMLButtonElement): Space {
  const bounds = group.getBoundingClientRect();
  const fontSize = Number.parseFloat(getComputedStyle(button).fontSize);
  return {
    x: bounds.left + bounds.width / 2,
    y: bounds.top + bounds.height / 2,
    unit: fontSize * (bounds.width / (group.offsetWidth || 1) || 1),
  };
}

function liftedPose(grab: Grab, now: number): Pose {
  const { point, space, anchor, from } = grab;
  const scale = liftScale(from.scale, grab.restingScale, now - grab.start);
  const lift = scale / from.scale;
  return {
    ...from,
    x: (point.x - space.x) / space.unit - anchor.x * lift,
    y: (point.y - space.y) / space.unit - anchor.y * lift,
    scale,
  };
}

function returnPose(home: Pose, returning: Return, now: number): Pose {
  const { offset, velocity } = returning;
  const elapsed = now - returning.start;
  return {
    x: home.x + springOffset(offset.x, velocity.x, elapsed),
    y: home.y + springOffset(offset.y, velocity.y, elapsed),
    scale: home.scale + springOffset(offset.scale, 0, elapsed),
    roll: home.roll + springOffset(offset.roll, 0, elapsed),
  };
}

function paintLetter(node: HTMLButtonElement, pose: Pose, depth: number) {
  const { x, y, scale, roll } = pose;
  node.style.transform = `translate(-50%, -50%) translate(${x.toFixed(4)}em, ${y.toFixed(4)}em) scale(${scale.toFixed(4)}) rotate(${roll.toFixed(2)}deg)`;
  if (node.style.zIndex !== String(depth)) node.style.zIndex = String(depth);
}

export function connectLetterpress(stage: HTMLDivElement, scrollport: HTMLDivElement | null, slider: HTMLDivElement | null) {
  const group = stage.querySelector<HTMLDivElement>("[data-letters]")!;
  const playButton = stage.querySelector<HTMLButtonElement>("[data-playback]");
  const buttons = Array.from(group.querySelectorAll<HTMLButtonElement>("button"));
  const fontFamily = getComputedStyle(group).fontFamily;
  buttons.forEach((button, index) => prepareGlyphArt(button, LETTERS[index]!.glyph, fontFamily));
  const order = flightOrder(LETTERS.length);
  const slots = LETTERS.map((letter, index) => ({
    letter,
    node: buttons[index]!,
    departure: letterDeparture(order[index]!, LETTERS.length),
    pose: letter.pile,
    depth: -1,
    placed: null as number | null,
    returning: null as Return | null,
  }));
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const touchScroll = window.matchMedia("(any-pointer: coarse)");
  const thumb = stage.querySelector<HTMLElement>("[data-scrubber-thumb]");
  let progress = 0;
  let targetProgress = 0;
  let rewind = 0;
  let placementOrder: number[] = [];
  let lastFrame: number | null = null;
  const focused = buttons.findIndex(button => button === document.activeElement);
  let focusIndex = Math.max(0, focused >= 0 ? focused : buttons.findIndex(button => button.tabIndex === 0));
  buttons.forEach((button, index) => { button.tabIndex = index === focusIndex ? 0 : -1; });
  let press: Press | null = null;
  let grab: Grab | null = null;
  let hold = 0;
  let frame = 0;
  let visible = true;
  let thumbProgress = 0;
  let scrollRange = 0;
  let writtenScrollTop: number | null = null;
  let playback: Playback | null = null;
  let playbackLabel = "Play animation";
  let touching = false;
  let stopAtEdge = false;

  function syncTouchBoundary() {
    if (!scrollport || !touchScroll.matches) return;
    const settlingAtEdge = (targetProgress === 1 && progress < TITLE_ARRIVAL) ||
      (targetProgress === 0 && progress > FIRST_DEPARTURE);
    const stop = !reduced.matches && (settlingAtEdge || (touching && stopAtEdge));
    if (stop === stopAtEdge) return;
    stopAtEdge = stop;
    scrollport.toggleAttribute("data-stop-at-edge", stop);
  }

  function rest(slot: typeof slots[number]) {
    return reduced.matches || slot.placed !== null ? slot.letter.home : flightPose(slot.letter, progress, slot.departure);
  }

  function returnTo(slot: typeof slots[number], home: Pose, now: number, velocity: Point = STILL) {
    const from = slot.pose;
    slot.returning = !reduced.matches && from !== home ? {
      start: now,
      velocity,
      offset: {
        x: from.x - home.x, y: from.y - home.y, scale: from.scale - home.scale,
        roll: from.roll - home.roll,
      },
    } : null;
  }

  function draw(now: number) {
    if (group.inert !== reduced.matches) syncMotionPreference();
    const elapsed = clamp(now - (lastFrame ?? now - 16.7), 0, 40);
    let next = targetProgress;
    if (playback && !playback.paused) {
      if (playback.phase === "rewind") {
        next = followScroll(progress, 0, elapsed);
        if (next === 0) playback.phase = "advance";
      } else {
        next = clamp(progress + elapsed / PLAYBACK_MS);
        if (next === 1) playback = null;
      }
      setTarget(next);
      if (!playback || touching) syncNativeScroll();
    } else if (!reduced.matches && scrollport) {
      next = followScroll(progress, targetProgress, elapsed);
    }
    if (thumb && thumbProgress !== targetProgress) {
      thumb.style.transform = `translateX(${100 * targetProgress}cqi)`;
      thumbProgress = targetProgress;
    }
    if (next < progress) {
      for (const [index, slot] of slots.entries()) {
        if (slot.placed === null || slot.placed === rewind) continue;
        const arrival = slot.departure + FLIGHT_SPAN;
        if (next === 0 || (progress >= arrival && next < arrival)) {
          slot.placed = null;
          slot.node.removeAttribute("data-placed");
          if (next === 0 && progress < arrival && grab?.index !== index) returnTo(slot, slot.letter.pile, now);
        }
      }
    }
    progress = next;
    syncTouchBoundary();
    syncPlayButton();
    let moving = Boolean(playback && !playback.paused) || progress !== targetProgress;
    slots.forEach((slot, index) => {
      const home = rest(slot);
      const held = grab?.index === index ? grab : null;
      const parked = !held && press?.index === index && press.parkedAt !== null;
      if (parked) return;
      if (slot.returning && now - slot.returning.start >= SETTLE_MS) slot.returning = null;
      const pose = held ? liftedPose(held, now) : slot.returning ? returnPose(home, slot.returning, now) : home;
      const depth = held ? ACTIVE_DEPTH : slot.placed !== null ? WORD_DEPTH + placementOrder.indexOf(index) : slot.letter.stack;
      if (pose !== slot.pose || depth !== slot.depth) {
        paintLetter(slot.node, pose, depth);
        slot.node.toggleAttribute("data-home", pose === slot.letter.home);
        slot.pose = pose;
        slot.depth = depth;
      }
      moving ||= Boolean(slot.returning) || Boolean(held && now - held.start < SETTLE_MS / 2.4);
    });
    lastFrame = moving ? now : null;
    if (moving) requestDraw();
  }

  function requestDraw() {
    if (frame || !visible || document.hidden) return;
    frame = requestAnimationFrame(now => {
      frame = 0;
      draw(now);
    });
  }

  function seek(value: number) {
    const next = clamp(Number.isFinite(value) ? value : 0);
    if (next === targetProgress) return;
    if (next < targetProgress) rewind++;
    setTarget(next);
    if (scrollport) {
      syncTouchBoundary();
      requestDraw();
    } else if (visible && !document.hidden) {
      draw(performance.now());
    }
  }

  function setTarget(next: number) {
    if (next === targetProgress) return;
    targetProgress = next;
    slider?.setAttribute("aria-valuenow", String(Math.round(1000 * next) / 10));
  }

  function syncNativeScroll() {
    if (!scrollport || !touchScroll.matches) return;
    writtenScrollTop = targetProgress * scrollRange;
    scrollport.scrollTop = writtenScrollTop;
  }

  function isTitleAssembled() {
    return progress >= TITLE_ARRIVAL || slots.every(slot =>
      slot.placed !== null || progress >= slot.departure + FLIGHT_SPAN);
  }

  function syncPlayButton() {
    if (!playButton) return;
    const playing = Boolean(playback && !playback.paused);
    const label = playing ? "Pause animation" :
      !playback && isTitleAssembled() ? "Replay animation" : "Play animation";
    if (label === playbackLabel) return;
    playbackLabel = label;
    playButton.setAttribute("aria-label", label);
    playButton.toggleAttribute("data-playing", playing);
    playButton.toggleAttribute("data-replay", label === "Replay animation");
  }

  function seekManually(value: number) {
    playback = null;
    seek(value);
    syncNativeScroll();
    syncPlayButton();
  }

  function pausePlayback() {
    if (!playback) return;
    playback.paused = true;
    syncNativeScroll();
    syncPlayButton();
  }

  function stopPlayback() {
    if (playback) seekManually(progress);
  }

  function clearPress() {
    if (!press) return;
    if (press.parkedAt !== null) {
      const returning = slots[press.index]?.returning;
      if (returning) {
        returning.start += performance.now() - press.parkedAt;
        requestDraw();
      }
    }
    press = null;
    window.clearTimeout(hold);
    window.removeEventListener("touchstart", onAdditionalTouch, true);
  }

  function onAdditionalTouch(event: TouchEvent) {
    if (event.touches.length > 1) drop(false);
  }

  function onGrabWheel(event: WheelEvent) {
    if (!event.ctrlKey) event.preventDefault();
  }

  function onGrabKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      drop(false);
    } else if (grab?.id != null && PAGE_KEYS.has(event.key)) {
      event.preventDefault();
    }
  }

  function pick(index: number, id: number | null, point?: Point) {
    stopPlayback();
    const slot = slots[index]!;
    const space = readSpace(group, slot.node);
    const from = slot.pose;
    const origin = point ?? { x: space.x + from.x * space.unit, y: space.y + from.y * space.unit };
    const now = performance.now();
    slot.returning = null;
    grab = {
      index, id, start: now, from, restingScale: rest(slot).scale, point: origin, space,
      anchor: { x: (origin.x - space.x) / space.unit - from.x, y: (origin.y - space.y) / space.unit - from.y },
      velocity: STILL, moved: now,
    };
    slot.node.setAttribute("data-lifted", "");
    slot.node.setAttribute("aria-pressed", "true");
    window.addEventListener("keydown", onGrabKeyDown, { ...options, capture: true });
    if (id !== null) {
      slot.node.setPointerCapture(id);
      window.addEventListener("wheel", onGrabWheel, { ...options, capture: true, passive: false });
    }
    requestDraw();
  }

  function drop(place: boolean, release?: Point) {
    clearPress();
    if (!grab) return;
    const now = performance.now();
    if (release) move(release, now);
    const { index, id, moved, velocity } = grab;
    const slot = slots[index]!;
    if (release) {
      slot.pose = liftedPose(grab, now);
      paintLetter(slot.node, slot.pose, ACTIVE_DEPTH);
    }
    grab = null;
    window.removeEventListener("keydown", onGrabKeyDown, true);
    window.removeEventListener("wheel", onGrabWheel, true);
    slot.node.removeAttribute("data-lifted");
    slot.node.setAttribute("aria-pressed", "false");
    if (id !== null && slot.node.hasPointerCapture(id)) slot.node.releasePointerCapture(id);
    if (place) {
      slot.placed = rewind;
      slot.node.setAttribute("data-placed", "");
      placementOrder = [...placementOrder.filter(placed => placed !== index), index];
    }
    returnTo(slot, rest(slot), now, place && now - moved < 75 ? velocity : STILL);
    requestDraw();
  }

  function readScroll() {
    if (group.inert !== reduced.matches) requestDraw();
    if (!scrollport || !scrollRange) return;
    const offset = scrollport.scrollTop;
    if (writtenScrollTop !== null && Math.abs(offset - writtenScrollTop) <= 1) return;
    writtenScrollTop = null;
    playback = null;
    seek(offset / scrollRange);
    syncPlayButton();
  }

  scrollport?.addEventListener("scroll", () => {
    if (touchScroll.matches) readScroll();
  }, { ...options, passive: true });

  if (scrollport && slider) {
    const port = scrollport;
    let lastSceneWheel = -Infinity;

    function trackTouch(event: TouchEvent) {
      touching = Array.from(event.touches).some(touch => touch.target instanceof Node && port.contains(touch.target));
      if (event.type === "touchstart" && event.target instanceof Node && playback) {
        if (playButton?.contains(event.target)) syncNativeScroll();
        else stopPlayback();
      }
      syncTouchBoundary();
    }
    const passive = { ...options, passive: true };
    port.addEventListener("touchstart", trackTouch, passive);
    port.addEventListener("touchend", trackTouch, passive);
    port.addEventListener("touchcancel", trackTouch, passive);

    playButton?.addEventListener("click", () => {
      if (reduced.matches) return;
      if (playback && !playback.paused) {
        pausePlayback();
        return;
      }
      if (grab) drop(false);
      if (playback) {
        playback.paused = false;
      } else {
        const phase = isTitleAssembled() ? "rewind" : "advance";
        playback = { phase, paused: false };
        if (phase === "rewind") {
          rewind++;
          progress = 1;
        }
      }
      setTarget(progress);
      syncNativeScroll();
      syncPlayButton();
      requestDraw();
    }, options);
    stage.addEventListener("keydown", event => {
      if (event.key === "Escape") pausePlayback();
    }, options);
    connectScrubber(slider, () => targetProgress, seekManually, options);

    scrollport.addEventListener("wheel", event => {
      if (reduced.matches || event.ctrlKey || event.defaultPrevented || !event.cancelable || Math.abs(event.deltaY) < Math.abs(event.deltaX)) return;
      const delta = event.deltaY * (event.deltaMode === 2 ? scrollRange : event.deltaMode === 1 ? 16 : 1);
      const current = targetProgress * scrollRange;
      const target = clamp(current + delta, 0, scrollRange);
      const landed = delta > 0 ? progress >= TITLE_ARRIVAL : progress <= FIRST_DEPARTURE;
      if ((!playback || playback.paused) && target === current && landed && event.timeStamp - lastSceneWheel > WHEEL_PAUSE_MS) return;
      event.preventDefault();
      lastSceneWheel = event.timeStamp;
      if (scrollRange) seekManually(target / scrollRange);
    }, { ...options, passive: false });
  }

  function indexOf(target: EventTarget | null) {
    const button = target instanceof Element ? target.closest<HTMLButtonElement>("[data-letter]") : null;
    return button?.parentElement === group ? Number(button.dataset.letter) : -1;
  }

  function pickIndex(event: PointerEvent) {
    const index = indexOf(event.target);
    if (index < 0) return index;
    const point = eventPoint(event);
    const hits = document.elementsFromPoint(point.x, point.y);
    const ink = indexOf(hits.find(node => node.closest("[data-glyph-art]")) ?? null);
    if (ink >= 0) return ink;
    const candidates = new Set(hits.map(indexOf).filter(candidate => candidate >= 0));
    let nearest = index;
    let distance = Infinity;
    for (const candidate of candidates) {
      const slot = slots[candidate]!;
      const bounds = slot.node.getBoundingClientRect();
      const dx = point.x - (bounds.left + bounds.width / 2);
      const dy = point.y - (bounds.top + bounds.height / 2);
      const squareDistance = dx * dx + dy * dy;
      if (squareDistance >= distance) continue;
      nearest = candidate;
      distance = squareDistance;
    }
    return nearest;
  }

  group.addEventListener("pointerdown", event => {
    if (reduced.matches || event.button !== 0 || !event.isPrimary || press || grab?.id != null) return;
    const index = pickIndex(event);
    if (index < 0) return;
    if (grab) drop(false);
    const touch = event.pointerType === "touch";
    const point = eventPoint(event);
    if (!touch) {
      event.preventDefault();
      pick(index, event.pointerId, point);
      return;
    }
    const returning = slots[index]?.returning;
    press = {
      index, id: event.pointerId, point,
      parkedAt: returning ? Math.max(returning.start, lastFrame ?? performance.now()) : null,
    };
    window.addEventListener("touchstart", onAdditionalTouch, { ...options, passive: true, capture: true });
    hold = window.setTimeout(() => {
      if (press && !grab) pick(press.index, press.id, press.point);
    }, TOUCH_HOLD_MS);
  }, options);

  function move(point: Point, now = performance.now()) {
    if (!grab || (point.x === grab.point.x && point.y === grab.point.y)) return;
    const rate = 1000 / (grab.space.unit * Math.max(8, now - grab.moved));
    grab.velocity = {
      x: clamp((point.x - grab.point.x) * rate, -8, 8),
      y: clamp((point.y - grab.point.y) * rate, -8, 8),
    };
    grab.point = point;
    grab.moved = now;
    requestDraw();
  }

  group.addEventListener("pointermove", event => {
    if (grab?.id === event.pointerId) move(eventPoint(event));
  }, options);

  group.addEventListener("touchmove", event => {
    const touch = event.touches[0];
    if (!press || !touch) return;
    if (event.touches.length !== 1 || !event.cancelable) {
      drop(false);
      return;
    }
    if (!grab) {
      const dx = touch.clientX - press.point.x;
      const dy = touch.clientY - press.point.y;
      if (Math.hypot(dx, dy) < TOUCH_SLOP) return;
      if (Math.abs(dx) <= Math.abs(dy)) {
        clearPress();
        return;
      }
      window.clearTimeout(hold);
      pick(press.index, press.id, press.point);
      move(eventPoint(touch));
    }
    event.preventDefault();
  }, { ...options, passive: false });

  function endPointer(event: PointerEvent) {
    if (grab?.id === event.pointerId) {
      if (event.type === "lostpointercapture" && event.target !== slots[grab.index]?.node) return;
      if (event.type === "pointerup") drop(true, eventPoint(event));
      else drop(false);
    }
    else if (press?.id === event.pointerId) clearPress();
  }
  group.addEventListener("pointerup", endPointer, options);
  group.addEventListener("pointercancel", endPointer, options);
  group.addEventListener("lostpointercapture", endPointer, options);

  group.addEventListener("click", event => {
    const index = indexOf(event.target);
    if (event.detail || index < 0 || reduced.matches || grab?.id != null) return;
    if (grab?.index === index) drop(true);
    else {
      if (grab) drop(false);
      pick(index, null);
    }
  }, options);

  group.addEventListener("focusin", event => {
    const index = indexOf(event.target);
    if (index < 0 || index === focusIndex) return;
    buttons[focusIndex]!.tabIndex = -1;
    buttons[index]!.tabIndex = 0;
    focusIndex = index;
  }, options);

  group.addEventListener("focusout", () => {
    if (grab?.id === null) drop(false);
  }, options);

  const focusOffset: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -LETTERS.length, End: LETTERS.length };
  group.addEventListener("keydown", event => {
    const offset = focusOffset[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    buttons[clamp(focusIndex + offset, 0, buttons.length - 1)]?.focus({ preventScroll: true });
  }, options);

  window.addEventListener("blur", () => drop(false), options);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopPlayback();
      drop(false);
    } else requestDraw();
  }, options);

  function syncMotionPreference() {
    if (reduced.matches) {
      stopPlayback();
      drop(false);
      for (const slot of slots) slot.returning = null;
    }
    group.inert = reduced.matches;
    syncTouchBoundary();
    refreshScrollRange();
  }

  reduced.addEventListener("change", () => {
    syncMotionPreference();
    draw(performance.now());
  }, options);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    if (visible) requestDraw();
    else {
      stopPlayback();
      drop(false);
    }
  });
  intersection.observe(stage);

  function refreshScrollRange() {
    scrollRange = scrollport ? scrollport.scrollHeight - scrollport.clientHeight : 0;
    if (playback) syncNativeScroll();
    else if (touchScroll.matches) readScroll();
  }

  const resize = new ResizeObserver(() => {
    refreshScrollRange();
    if (!grab) return;
    grab.space = readSpace(group, buttons[grab.index]!);
    if (grab.id === null) {
      grab.point = { x: grab.space.x + grab.from.x * grab.space.unit, y: grab.space.y + grab.from.y * grab.space.unit };
    }
    requestDraw();
  });
  resize.observe(group);

  syncMotionPreference();
  draw(performance.now());
  group.setAttribute("data-ready", "");

  return {
    seek,
    dispose() {
      drop(false);
      listeners.abort();
      scrollport?.removeAttribute("data-stop-at-edge");
      for (const slot of slots) slot.node.removeAttribute("data-placed");
      intersection.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}
