export function Badger({ small = false }: { small?: boolean }) {
  return (
    <svg className={`badger-art${small ? ' badger-small' : ''}`} viewBox="0 0 240 190" role="img" aria-label="Badger-Flores, a smiling badger wearing a lilac scarf and a daisy">
      <ellipse cx="120" cy="174" rx="68" ry="8" fill="#dcd9d0" opacity=".55" />
      <g className="badger-garden" fill="none" stroke="#809676" strokeWidth="3" strokeLinecap="round">
        <path d="M44 172q8-22-5-39m6 23q-13-1-16-12m17 21q12-6 14-17M195 171q-5-24 8-42m-8 28q14-4 15-16" />
        <path d="M33 140q-12-9-12-1 1 10 13 9M48 157q14-17 17-8-2 10-17 13M199 146q-8-18-14-11-2 10 14 16" fill="#a8b99a" stroke="none" />
      </g>
      <g className="badger-bob">
        <path d="M80 109q-16 22-12 52 8 18 52 16 48 2 53-16 1-36-18-55" fill="#73717b" />
        <ellipse cx="121" cy="146" rx="30" ry="29" fill="#eae6df" />
        <ellipse cx="85" cy="168" rx="19" ry="10" fill="#45444e" />
        <ellipse cx="155" cy="168" rx="19" ry="10" fill="#45444e" />
        <g className="badger-wave">
          <path d="M157 119q22-3 25-26 2-10 10-6 10 7 1 28-9 25-32 26" fill="#73717b" />
          <ellipse cx="190" cy="88" rx="11" ry="13" transform="rotate(24 190 88)" fill="#484751" />
          <path d="m185 80 0 4m6-3-1 4m6-1-2 4" stroke="#b9b6ba" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        <path d="M77 121q-16 7-12 26 4 13 15 12 12-4 3-16" fill="#73717b" />
        <ellipse cx="76" cy="153" rx="10" ry="9" fill="#484751" />
        <circle cx="85" cy="49" r="20" fill="#55525d" />
        <circle cx="159" cy="49" r="20" fill="#55525d" />
        <circle cx="86" cy="48" r="12" fill="#c9bac6" />
        <circle cx="158" cy="48" r="12" fill="#c9bac6" />
        <path d="M71 74q1-44 50-42 49-2 52 43 2 28-26 45-25 17-51-1Q69 103 71 74Z" fill="#f6f1e6" />
        <path d="M88 43q13-7 24-9L99 74q-4 17 13 30-25-4-33-23-5-17 9-38M153 42q-11-7-23-8l14 41q4 17-13 29 25-4 34-23 4-19-12-39" fill="#4b4954" />
        <g className="badger-eyes">
          <ellipse cx="98" cy="76" rx="6" ry="7" fill="#fffdf7" />
          <ellipse cx="146" cy="76" rx="6" ry="7" fill="#fffdf7" />
          <circle cx="99" cy="78" r="3.7" fill="#302e39" />
          <circle cx="145" cy="78" r="3.7" fill="#302e39" />
          <circle cx="100" cy="76" r="1.3" fill="white" />
          <circle cx="146" cy="76" r="1.3" fill="white" />
        </g>
        <ellipse cx="90" cy="94" rx="8" ry="4" fill="#dbaaa8" opacity=".65" />
        <ellipse cx="155" cy="94" rx="8" ry="4" fill="#dbaaa8" opacity=".65" />
        <path d="M113 96q9-6 18 0-1 10-9 10t-9-10" fill="#373441" />
        <path d="M122 105v5m0 0q-7 6-13 0m13 0q7 6 13 0" fill="none" stroke="#6d626d" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M88 119q33 14 68-1l-3 12q-33 15-61-1Z" fill="#a588b5" />
        <path d="m131 130 15 0 5 28-15-5-6 7Z" fill="#b399c1" />
        <path d="m132 138 16-2m-14 9 15-2" stroke="#896c9a" strokeWidth="2" />
        <g className="badger-flower" transform="translate(161 48)">
          <g fill="#fff9ee">
            <ellipse cy="-10" rx="5" ry="9" />
            <ellipse cy="10" rx="5" ry="9" />
            <ellipse cx="-10" rx="9" ry="5" />
            <ellipse cx="10" rx="9" ry="5" />
            <ellipse cy="-10" rx="5" ry="9" transform="rotate(45)" />
            <ellipse cy="10" rx="5" ry="9" transform="rotate(45)" />
            <ellipse cx="-10" rx="9" ry="5" transform="rotate(45)" />
            <ellipse cx="10" rx="9" ry="5" transform="rotate(45)" />
          </g>
          <circle r="7" fill="#e8be64" />
          <circle r="3.3" fill="#d9a449" />
        </g>
      </g>
      <g fill="#b09abd" className="floating-petals">
        <path d="M44 77q-7-10-2-12 7 0 2 12M194 53q-1-10 6-10 5 6-6 10" />
        <path d="M52 101q-8 1-8-5 6-5 8 5" fill="#deb65e" />
      </g>
    </svg>
  )
}
