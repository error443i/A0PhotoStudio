import ThemeToggle from "./theme-toggle";
import ProjectGallery from "./project-gallery";
import ScrollReveal from "./scroll-reveal";
import { DEFAULT_HERO_BACKGROUND, getFeaturedStories, getHeroBackground } from "@/lib/portfolio";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [projects, heroBackground] = await Promise.all([
    getFeaturedStories(),
    getHeroBackground(),
  ]);
  const telegramBotUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const telegramUrl = telegramBotUsername
    ? `https://t.me/${telegramBotUsername.replace(/^@/, "")}`
    : "https://t.me/";

  return (
    <main>
      <ScrollReveal />
      <header className="site-header">
        <a className="wordmark" href="#home" aria-label="AO Photography home" data-reveal>
          AO Photography
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#work" data-reveal>PORTFOLIO</a>
          <a href="#about" data-reveal>ABOUT</a>
          <a href="#contact" data-reveal>CONTACT</a>
        </nav>
        <a className="mobile-menu" href="#work" aria-label="Explore portfolio" data-reveal>
          EXPLORE <span aria-hidden="true">↓</span>
        </a>
        <ThemeToggle />
      </header>

      <section
        className="hero"
        id="home"
        aria-labelledby="hero-title"
        style={{ backgroundImage: `url("${heroBackground ?? DEFAULT_HERO_BACKGROUND}")` }}
      >
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-content">
          <p className="hero-kicker" data-reveal="load">Yangon, Myanmar · AVAILABLE IN YANGON</p>
          <h1 id="hero-title" data-reveal="load">AO PHOTOGRAPHY</h1>
          <p className="hero-subtitle" data-reveal="load">Wedding &amp; lifestyle photographer</p>
          <p className="hero-description" data-reveal="load">
            Honest photographs for the wildly in love, the growing family, and
            every beautiful in-between.
          </p>
          <a className="scroll-cue" href="#work" data-reveal="load">
            <span>SCROLL TO EXPLORE</span>
            <span className="scroll-arrow" aria-hidden="true">↓</span>
          </a>
        </div>
      </section>

      <section className="work-section section-wrap" id="work">
        <div className="section-heading">
          <div>
            <span className="section-index" data-reveal>01 / PORTFOLIO</span>
            <h2 data-reveal>Featured <em>stories.</em></h2>
            <p data-reveal>A selection of recent work, gathered in good light.</p>
          </div>
          <span className="project-count" data-reveal>2025 — 2026 <span aria-hidden="true">↘</span></span>
        </div>
        <ProjectGallery projects={projects} />
        <a className="view-all-link" href={telegramUrl} data-reveal>
          HAVE A STORY IN MIND? <span aria-hidden="true">↗</span>
        </a>
      </section>

      <section className="about-section section-wrap" id="about">
        <div className="about-label">
          <span className="section-index" data-reveal>02 / ABOUT</span>
          <span className="eyebrow" data-reveal>A LITTLE ABOUT MY WORK</span>
        </div>
        <div className="about-copy">
          <h2 data-reveal>
            I&apos;ll make today          
            <em> Unforgettable.</em>
          </h2>
          <p data-reveal>
            I&apos;m a Yangon-based photographer drawn to the unscripted bits:
            the wind-tangled hair, the happy tears, the way your people gather
            around you. My work is made to feel like being there all over again.
          </p>
          <a className="text-link" href={telegramUrl} data-reveal>
            LET&apos;S MAKE SOMETHING TOGETHER <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      <section className="contact-section" id="contact">
        <p className="section-index" data-reveal>03 / YOUR TURN</p>
        <h2 data-reveal>Let&apos;s make something<br /><em>you can feel.</em></h2>
        <p data-reveal>Tell me what you&apos;re dreaming up. I&apos;d love to hear about it.</p>
        <a className="contact-button" href={telegramUrl} data-reveal>
          CONTACT US <span aria-hidden="true">↗</span>
        </a>
      </section>

      <footer className="site-footer">
        <a className="footer-wordmark" href="#home">AO PHOTOGRAPHY</a>
        <div className="footer-tagline">PHOTOGRAPHS FOR THE FEELING OF IT.</div>
        <div className="footer-copyright">© AO PHOTOGRAPHY 2026</div>
      </footer>
    </main>
  );
}
