"use client";

import { useEffect, useState } from "react";
import type { PortfolioProject } from "@/lib/portfolio";

export default function ProjectGallery({ projects }: { projects: PortfolioProject[] }) {
  const [activeProject, setActiveProject] = useState<PortfolioProject | null>(null);
  const [activePhoto, setActivePhoto] = useState<number | null>(null);

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
              <span className="project-open" aria-hidden="true">↗</span>
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
                <span aria-hidden="true">←</span>
                {activePhoto === null ? "BACK TO PORTFOLIO" : "BACK TO COLLECTION"}
              </button>
              <div className="gallery-title-block" data-reveal>
                <p className="section-index">PHOTO COLLECTION · {activeProject.category.toUpperCase()}</p>
                <h2 id="gallery-title">{activeProject.title}</h2>
                <p>{activeProject.year} <span>·</span> {activeProject.images.length} photographs</p>
              </div>
            </header>
            {activePhoto === null ? (
              <div className="gallery-photos">
                {activeProject.images.map((image, index) => (
                  <button
                    className="gallery-photo"
                    type="button"
                    key={image}
                    data-reveal
                    onClick={() => setActivePhoto(index)}
                    aria-label={`View photo ${index + 1} of ${activeProject.images.length}`}
                    style={{ backgroundImage: `url("${image}")` }}
                  >
                    <span>0{index + 1}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="gallery-viewer">
                <div
                  className="gallery-featured-photo"
                  role="img"
                  aria-label={`${activeProject.title}, photo ${activePhoto + 1}`}
                  style={{ backgroundImage: `url("${activeProject.images[activePhoto]}")` }}
                />
                <div className="gallery-viewer-footer">
                  <button
                    type="button"
                    onClick={() => setActivePhoto((activePhoto - 1 + activeProject.images.length) % activeProject.images.length)}
                    aria-label="Previous photo"
                  >
                    ← PREVIOUS
                  </button>
                  <span>{String(activePhoto + 1).padStart(2, "0")} / {String(activeProject.images.length).padStart(2, "0")}</span>
                  <button
                    type="button"
                    onClick={() => setActivePhoto((activePhoto + 1) % activeProject.images.length)}
                    aria-label="Next photo"
                  >
                    NEXT →
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
