// Original vector artwork for sample entries and missing posters; no external image requests.
export default function FilmArtwork({ title, variant = 0 }) {
  const palettes = [['#29483F', '#D6BE83', '#122D27'], ['#783C43', '#F0C79D', '#3D2932'], ['#2D3E51', '#D6DFD2', '#152432']];
  const [background, light, foreground] = palettes[variant % palettes.length];
  return <div className="film-artwork" style={{ background }}>
    <svg viewBox="0 0 240 340" aria-hidden="true" preserveAspectRatio="xMidYMid slice">
      <circle cx={variant % 2 ? 160 : 100} cy="105" r="55" fill={light} />
      <path d="M0 250L75 130L145 235L192 178L240 243V340H0Z" fill={foreground} />
      <path d="M0 292Q90 230 240 285V340H0Z" fill={light} opacity=".18" />
      <path d="M120 340L132 249L147 340" fill={light} opacity=".55" />
      <path d="M20 24H220M20 316H220" stroke={light} opacity=".45" />
    </svg>
    <span className="film-artwork-title">{title}</span>
  </div>;
}
