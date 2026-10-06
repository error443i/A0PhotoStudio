"use client";

import { useEffect } from "react";

export default function ScrollReveal() {
  useEffect(() => {
    const root = document.documentElement;
    if (!("IntersectionObserver" in window)) {
      document
        .querySelectorAll<HTMLElement>("[data-reveal]")
        .forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
          } else {
            entry.target.classList.remove("is-visible");
          }
        });
      },
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );

    root.dataset.scrollReveal = "enabled";
    const observed = new WeakSet<Element>();

    function observeElements(node: Node) {
      if (!(node instanceof Element)) return;
      const elements = [
        ...(node.matches("[data-reveal]") ? [node] : []),
        ...node.querySelectorAll("[data-reveal]"),
      ];
      elements.forEach((element) => {
        if (observed.has(element)) return;
        observed.add(element);
        observer.observe(element);
      });
    }

    observeElements(document.body);
    const mutationObserver = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach(observeElements);
      });
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutationObserver.disconnect();
      observer.disconnect();
      delete root.dataset.scrollReveal;
    };
  }, []);

  return null;
}
