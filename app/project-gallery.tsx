"use client";

import { useEffect, useState, useMemo } from "react";
import type { PortfolioProject } from "@/lib/portfolio";
import { ArrowUpRightIcon, ArrowLeftIcon, ArrowRightIcon } from "./icons";

export default function ProjectGallery({ projects }: { projects: PortfolioProject[] }) {
  const [activeProject, setActiveProject] = useState<PortfolioProject | null>(null);
  const [activePhoto, setActivePhoto] = useState<number | null>(null);
  const [colCount, setColCount] = useState(4);

  useEffect(() => {
    function updateColumns() {
      const w = window.innerWidth;
      if (w < 600) setColCount(1);
      else if (w < 900) setColCount(2);
      else if (w < 1250) setColCount(3);
      else if (w < 1650) setColCount(4);
      else setColCount(5);
    }

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  const masonryColumns = useMemo(() => {
    if (!activeProject) return [];
    const count = Math.max(1, Math.min(colCount, activeProject.images.length));
    const cols: { image: string; index: number }[][] = Array.from(
      { length: count },
      () => [],
    );
    activeProject.images.forEach((image, index) => {
      cols[index % count].push({ image, index });
    });
    return cols;
  }, [activeProject, colCount]);

  useEffect(() => {
    if (!activeProject) return;

    const photoCount = activeProject.images.length;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (activePhoto !== null) {
          setActivePhoto(null);
        } else {
          setActiveProject(null);
        }
      }

      if (activePhoto !== null && event.key === "ArrowRight") {
        setActivePhoto((photo) => (photo === null ? null : (photo + 1) % photoCount));
      }

      if (activePhoto !== null && event.key === "ArrowLeft") {
        setActivePhoto((photo) =>
          photo === null
            ? null
            : (photo - 1 + photoCount) % photoCount,
        );
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [activeProject, activePhoto]);

  return (
    <>
      <div className="project-grid">
        {projects.map((project, index) => (
          <button
            className="project-card"
            key={project.id}
            type="button"
            data-reveal
            onClick={() => {
              setActiveProject(project);
              setActivePhoto(null);
            }}
            aria-label={`View ${project.title} ${project.category} photo collection`}
          >
            <span
              className="project-image"
              role="img"
              aria-label={`${project.category} photography: ${project.title}`}
              style={
                project.images[0]
                  ? { backgroundImage: `url("${project.images[0]}")` }
                  : undefined
              }
            >
              <span className="project-number">0{index + 1}</span>
              {/* <span className="project-open" aria-hidden="true">
                <ArrowUpRightIcon size={16} />
              </span> */}
              <span className="project-details">
                <span className="project-title">{project.title}</span>
                <span className="project-meta">{project.category} <i>·</i> {project.year}</span>
              </span>
              <span className="project-photo-count">{project.images.length} PHOTOS</span>
            </span>
          </button>
        ))}
      </div>

      {activeProject && (
        <div className="gallery-overlay">
          <section
            className="gallery-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-title"
          >
            <header className="gallery-header">
              <button
                className="gallery-close"
                type="button"
                onClick={() => {
                  if (activePhoto !== null) setActivePhoto(null);
                  else setActiveProject(null);
                }}
                aria-label={activePhoto === null ? "Close photo collection" : "Back to photo collection"}
              >
                <ArrowLeftIcon size={14} />
                <span>{activePhoto === null ? "BACK TO PORTFOLIO" : "BACK TO COLLECTION"}</span>
              </button>
              <div className="gallery-title-block" data-reveal>
                <p className="section-index">PHOTO COLLECTION · {activeProject.category.toUpperCase()}</p>
                <h2 id="gallery-title">{activeProject.title}</h2>
                <p>{activeProject.year} <span>·</span> {activeProject.images.length} photographs</p>
              </div>
            </header>
            {activePhoto === null ? (
              <div className="gallery-photos">
                {masonryColumns.map((colPhotos, colIndex) => (
                  <div className="gallery-photos-col" key={colIndex}>
                    {colPhotos.map(({ image, index }) => (
                      <button
                        className="gallery-photo"
                        type="button"
                        key={image}
                        data-reveal
                        onClick={() => setActivePhoto(index)}
                        aria-label={`View photo ${index + 1} of ${activeProject.images.length}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image}
                          alt={`${activeProject.title}, photo ${index + 1}`}
                          loading={index < 4 ? "eager" : "lazy"}
                        />
                        <span className="gallery-pin-tag">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="gallery-photo-overlay" aria-hidden="true">
                          <span className="gallery-photo-zoom-btn">
                            <svg
                              width="13"
                              height="13"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx="11" cy="11" r="8" />
                              <line x1="21" y1="21" x2="16.65" y2="16.65" />
                              <line x1="11" y1="8" x2="11" y2="14" />
                              <line x1="8" y1="11" x2="14" y2="11" />
                            </svg>
                            <span>View</span>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className="gallery-viewer">
                <div className="gallery-viewer-stage">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="gallery-viewer-img"
                    src={activeProject.images[activePhoto]}
                    alt={`${activeProject.title}, photo ${activePhoto + 1}`}
                  />
                </div>
                <div className="gallery-viewer-footer">
                  <button
                    type="button"
                    onClick={() => setActivePhoto((activePhoto - 1 + activeProject.images.length) % activeProject.images.length)}
                    aria-label="Previous photo"
                  >
                    <ArrowLeftIcon size={10} /> PREVIOUS
                  </button>
                  <div className="gallery-viewer-center-meta">
                    <span>{String(activePhoto + 1).padStart(2, "0")} / {String(activeProject.images.length).padStart(2, "0")}</span>
                    <a
                      href={activeProject.images[activePhoto]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="gallery-viewer-original-link"
                      title="Open full resolution photo in new tab"
                    >
                      ORIGINAL RESOLUTION <ArrowUpRightIcon size={9} />
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActivePhoto((activePhoto + 1) % activeProject.images.length)}
                    aria-label="Next photo"
                  >
                    NEXT <ArrowRightIcon size={10} />
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
