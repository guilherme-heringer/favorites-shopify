(() => {
  const ENDPOINT = "/apps/avise-me/register";
  const roots = document.querySelectorAll('[id^="favoritos-root-"]');
  if (!roots.length) return;

  roots.forEach((root) => {
    const button = root.querySelector(".favoritos-heart-button");
    const status = root.querySelector(".favoritos-status");
    if (!(button instanceof HTMLButtonElement) || !(status instanceof HTMLElement)) return;

    const labels = {
      add: root.dataset.labelAdd || "Added to favorites.",
      remove: root.dataset.labelRemove || "Removed from favorites.",
      login: root.dataset.labelLogin || "Sign in to save favorites.",
      saving: root.dataset.labelSaving || "Saving...",
      error: root.dataset.labelError || "Could not save favorite.",
    };

    const productGid = root.dataset.productId
      ? `gid://shopify/Product/${root.dataset.productId}`
      : "";

    (async function hydrate() {
      if (!root.dataset.customerId || !productGid) return;
      try {
        const response = await fetch(ENDPOINT, {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const body = await response.json();
        if (!body || body.ok === false || !Array.isArray(body.favorites)) return;
        const isFav = body.favorites.includes(productGid);
        button.classList.toggle("is-favorited", isFav);
        button.setAttribute("aria-pressed", isFav ? "true" : "false");
      } catch {
        // ignore — fall back to the SSR'd state
      }
    })();

    button.addEventListener("click", async () => {
      const customerId = root.dataset.customerId || "";
      const loginUrl = root.dataset.loginUrl || "/account/login";
      const productUrl = root.dataset.productUrl || window.location.pathname || "/";
      const productId = root.dataset.productId || "";

      if (!customerId) {
        const returnUrl = encodeURIComponent(productUrl + window.location.search);
        const href = `${loginUrl}?return_url=${returnUrl}`;
        status.textContent = `${labels.login} `;
        const loginLink = document.createElement("a");
        loginLink.href = href;
        loginLink.textContent = "→";
        status.appendChild(loginLink);
        button.classList.remove("is-favorited");
        button.setAttribute("aria-pressed", "false");
        return;
      }

      if (!productId) {
        status.textContent = labels.error;
        return;
      }

      button.disabled = true;
      status.textContent = labels.saving;

      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ productId }),
        });
        const contentType = response.headers.get("content-type") || "";
        const isJson = contentType.includes("application/json");
        const body = isJson ? await response.json() : null;

        if (!response.ok || !body || body.ok === false) {
          throw new Error((body && body.error) || labels.error);
        }

        if (body.action === "removed") {
          button.classList.remove("is-favorited");
          button.setAttribute("aria-pressed", "false");
          status.textContent = labels.remove;
        } else {
          button.classList.add("is-favorited");
          button.setAttribute("aria-pressed", "true");
          status.textContent = labels.add;
        }
      } catch (error) {
        status.textContent = error instanceof Error && error.message ? error.message : labels.error;
      } finally {
        button.disabled = false;
      }
    });
  });
})();
