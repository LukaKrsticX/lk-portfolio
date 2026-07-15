"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { Intersection, Mesh, ShaderMaterial } from "three";
import { Quaternion, Raycaster, Vector3 } from "three";
import { capture } from "@/lib/analytics";
import { hoverStep, isInteractiveTarget } from "@/lib/card-raycast";
import { isPortalActive, openPortal } from "@/lib/portal-store";
import { scrollSignals } from "@/lib/scroll";
import type { PointerState } from "./use-pointer-tracker";

interface CardRaycastOpts {
  /** the card quad meshes in world (nulls tolerated pre-mount); indices align with `materials`/`slugs` */
  readonly meshes: RefObject<(Mesh | null)[]>;
  /** per-card materials — the hook writes uHover (eased) + uHoverPoint (hit uv) each frame */
  readonly materials: readonly ShaderMaterial[];
  /** window pointer (ndc for the ray, clientXY for the interactive-DOM guard) */
  readonly pointer: RefObject<PointerState>;
  /** card slugs, index-aligned — carried on the click stub */
  readonly slugs: readonly string[];
  /** off → no raycast, hovers ease to 0, cursor restored (gated with the ?work flag by the caller) */
  readonly enabled: boolean;
}

/**
 * Per-frame manual Raycaster for the helix work cards. R3F pointer events can never fire (the
 * canvas wrapper is zIndex −1 under the DOM — Phase-0 fact), so hover/click is a window-pointer
 * ray against the card planes, using the REAL rig-driven camera (useThree). One eased uHover per
 * card + uHoverPoint from the hit uv; the body cursor turns to a pointer only over a card AND not
 * over interactive DOM; a window click (same guard) fires the work_card_click stub (the portal is P4).
 * matrixWorld is a frame stale inside useFrame (updated at render) — the accepted one-frame lag.
 */
export function useCardRaycast({ meshes, materials, pointer, slugs, enabled }: CardRaycastOpts): void {
  const camera = useThree((s) => s.camera);
  const raycaster = useMemo(() => new Raycaster(), []);
  const hits = useRef<Intersection[]>([]);
  const hover = useRef<number[]>(materials.map(() => 0));
  const cursorOn = useRef(false);
  // Card index currently under the cursor (or −1) — read by the click listener, written per frame.
  const hitIndex = useRef(-1);
  // Scratch for the fly-in target (card world center + its outward normal) — no per-click allocation.
  const scratchPos = useMemo(() => new Vector3(), []);
  const scratchQuat = useMemo(() => new Quaternion(), []);
  const scratchNormal = useMemo(() => new Vector3(), []);

  // Click → work_card_click + open the portal (openPortal self-guards on ?portal + virtual mode, so
  // native/reduced keep the plain DOM external-link cards). Re-guards the interactive-DOM check at
  // click time (the frame's hit may be stale by a move). Camera fly-in target = the card's world
  // center pushed out along its normal, so the camera dives INTO the clicked card face.
  useEffect(() => {
    if (!enabled) return;
    const onClick = (e: MouseEvent): void => {
      // While a portal is engaged (open or animating closed) the cards sit behind the dialog and
      // scroll is locked — a bubbled click on a dialog control (close/prev/next) must not re-fire the
      // card stub. The dialog can unmount synchronously before this window listener runs, so the
      // elementFromPoint guard below would miss it; gate on the portal-active flag directly.
      if (isPortalActive()) return;
      // hitIndex is −1 outside the work window (the frame loop clears it), so a click on a hidden
      // card can never fire — but re-check the interactive-DOM guard against the live cursor too.
      if (isInteractiveTarget(document.elementFromPoint(e.clientX, e.clientY))) return;
      const i = hitIndex.current;
      if (i < 0 || i >= slugs.length) return;
      capture("work_card_click", { slug: slugs[i] });
      const mesh = meshes.current?.[i];
      if (!mesh) {
        openPortal(i, "click");
        return;
      }
      mesh.getWorldPosition(scratchPos);
      mesh.getWorldQuaternion(scratchQuat);
      scratchNormal.set(0, 0, 1).applyQuaternion(scratchQuat).normalize();
      openPortal(i, "click", {
        target: {
          pos: [
            scratchPos.x + scratchNormal.x * 0.55,
            scratchPos.y + scratchNormal.y * 0.55,
            scratchPos.z + scratchNormal.z * 0.55,
          ],
          look: [scratchPos.x, scratchPos.y, scratchPos.z],
        },
      });
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, [enabled, slugs, meshes, scratchPos, scratchQuat, scratchNormal]);

  // Cursor must never be left as a pointer when the hook stops owning it.
  useEffect(
    () => () => {
      if (cursorOn.current) document.body.style.cursor = "";
      cursorOn.current = false;
    },
    [],
  );

  useFrame((_, delta) => {
    if (!enabled) return;
    const dt = Math.min(delta, 1 / 30);
    const p = pointer.current;

    // Guard: while the cursor is over a real DOM control, the cards yield entirely (no hit).
    const overInteractive = isInteractiveTarget(document.elementFromPoint(p.clientX, p.clientY));
    // Only raycast inside the work window. A three Raycaster tests a mesh's OWN visible flag, not
    // its ancestor group's — so without this the hidden off-window cards would still take hits.
    const workP = scrollSignals.workP;
    const inWindow = workP > 0.001 && workP < 0.999;

    let hit = -1;
    let hitU = 0.5;
    let hitV = 0.5;
    const all = meshes.current ?? [];
    if (inWindow && !overInteractive && p.moved) {
      raycaster.setFromCamera(p.ndc, camera);
      hits.current.length = 0;
      const meshList = all.filter((m): m is Mesh => m != null);
      const results = raycaster.intersectObjects(meshList, false, hits.current);
      if (results.length > 0) {
        const top = results[0];
        hit = all.indexOf(top.object as Mesh);
        if (top.uv) {
          hitU = top.uv.x;
          hitV = top.uv.y;
        }
      }
    }
    hitIndex.current = hit;

    for (let i = 0; i < materials.length; i++) {
      const isHit = i === hit;
      hover.current[i] = hoverStep(hover.current[i], isHit, dt);
      const u = materials[i].uniforms;
      u.uHover.value = hover.current[i];
      if (isHit) (u.uHoverPoint.value as { set(x: number, y: number): void }).set(hitU, hitV);
    }

    const wantPointer = hit >= 0 && !overInteractive;
    if (wantPointer !== cursorOn.current) {
      document.body.style.cursor = wantPointer ? "pointer" : "";
      cursorOn.current = wantPointer;
    }
  });
}
