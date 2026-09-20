export function AboutPage() {
  return (
    <div className="container page">
      <h1 className="page-title">关于</h1>
      <p className="page-sub">林澜 —— 独立摄影师，现居成都。</p>

      <div className="two-col">
        <div>
          <p>
            林澜的镜头长期停留在两个方向：一是黑白人像里那些来不及收回的眼神，
            二是高原无人地带的光、风与牧场日常。她相信照片不是猎取，而是等待——
            等被摄者忘记镜头，等雾气漫过山脊，等牛群自己走进构图。
          </p>
          <p>
            过去十年，她往返于城市与高原之间，把每一次驻留都整理成一个系列：
            《凝视》记录镜头前的坦露与防备，《无人之境》记录纯粹地貌在四季光线下的变化，
            《高原牧歌》记录游牧生活的日常节奏。
          </p>
          <p className="muted">
            本站同时是她的策展工作台：每一个对外发布的合集都经过校样版本管理、
            发布校验与换人复核，历史快照永久留档可查。
          </p>
        </div>
        <div>
          <h3 className="heading">经历</h3>
          <ul className="timeline">
            <li>
              <div className="year">2016</div>
              <div>开始长期拍摄高原牧场，第一次在冬季牧场驻留三个月。</div>
            </li>
            <li>
              <div className="year">2018</div>
              <div>《凝视》系列雏形完成，黑白人像成为持续至今的并行线索。</div>
            </li>
            <li>
              <div className="year">2021</div>
              <div>《无人之境》完成首轮拍摄，海拔 4500 米以上驻留累计超过两百天。</div>
            </li>
            <li>
              <div className="year">2024</div>
              <div>《高原牧歌》结集成册，开始以策展合集形式对外发布精选版本。</div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
