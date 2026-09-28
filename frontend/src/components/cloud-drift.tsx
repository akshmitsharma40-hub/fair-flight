/**
 * CloudDrift — a fixed, pointer-invisible cloud stratum behind the content.
 *
 * Implementation notes:
 *  - Pure CSS: each layer is ONE div painted with layered radial-gradients
 *    (soft white blobs) — no images, no canvas, no per-frame JS.
 *  - Motion is transform-only translate3d on multi-minute loops, so the
 *    browser keeps everything on the compositor: near-zero main-thread cost.
 *  - Two layers drift at different speeds → parallax depth; a third, fainter
 *    layer moves the opposite way for a wind-shear feel.
 *  - Opacity follows the theme variables (stronger in dark "night sky",
 *    softer in light "institutional paper"), and `prefers-reduced-motion`
 *    freezes the drift entirely (CSS in styles.css).
 *  - Mounted right after .aurora-backdrop so it sits above the aurora but
 *    below every panel; z-index -8 keeps it out of all interaction.
 */
export function CloudDrift() {
  return (
    <div className="cloud-drift" aria-hidden="true">
      <div className="cloud-layer cloud-layer-far" />
      <div className="cloud-layer cloud-layer-mid" />
      <div className="cloud-layer cloud-layer-near" />
    </div>
  );
}

export default CloudDrift;
