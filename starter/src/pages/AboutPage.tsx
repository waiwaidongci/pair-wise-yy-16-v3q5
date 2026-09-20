export function AboutPage() {
  const timeline = [
    { year: '2014', text: '首次在个人展《近距离》中展出黑白肖像系列。' },
    { year: '2017', text: '深入高原无人区拍摄，开始《无人之境》长期项目。' },
    { year: '2020', text: '出版摄影集《牧歌》，记录游牧生活的日常节奏。' },
    { year: '2024', text: '作品于多地画廊巡展，并建立策展合集发布机制。' },
  ]
  return (
    <div className="container about-page">
      <div className="about-grid">
        <div className="about-portrait">
          <img src="/photos/landscape/landscape-01.jpg" alt="摄影师工作环境中的高原草甸" />
        </div>
        <div className="about-body">
          <h1 className="page-title">about bio</h1>
          <p>
            Remanina Holmson 是一名独立摄影师，长期以极简、克制的方式处理肖像与地貌。
            她的工作节奏缓慢：同一个系列往往跨越数年反复回到现场，直到光线、距离与被摄者的
            状态同时落进取景框。
          </p>
          <p>
            近年她将作品按系列策展为可发布的合集，每个合集都经过校样选择、必选内容核对、
            署名与双重复核流程，保证线上版本与创作意图一致。
          </p>

          <hr className="gold-rule" />

          <ol className="timeline">
            {timeline.map((t) => (
              <li key={t.year}>
                <span className="timeline-dot" aria-hidden />
                <div>
                  <strong>{t.year}</strong>
                  <p>{t.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}
