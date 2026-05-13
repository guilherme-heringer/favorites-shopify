(() => {
  const roots = document.querySelectorAll('[id^="favoritos-list-root-"]');
  if (!roots.length) return;

  const parsePayload = (rawPayload) => {
    if (!rawPayload || typeof rawPayload !== "string") return [];
    return rawPayload
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^\d+$/.test(value));
  };

  const formatMoney = (cents, moneyFormat) => {
    if (typeof cents !== "number") return "";
    const amount = (cents / 100).toFixed(2);
    return moneyFormat
      .replace(/\{\{\s*amount\s*\}\}/g, amount)
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, String(Math.round(cents / 100)))
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, amount.replace(".", ","))
      .replace(
        /\{\{\s*amount_no_decimals_with_comma_separator\s*\}\}/g,
        String(Math.round(cents / 100)),
      );
  };

  const escapeHtml = (text) =>
    String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const fetchJson = async (url) => {
    const response = await fetch(url);
    if (!response.ok) return null;
    return response.json();
  };

  const fetchProductCard = async (productId) => {
    const data = await fetchJson(
      `/search/suggest.json?q=${encodeURIComponent(productId)}&resources[type]=product&resources[limit]=10`,
    );
    const products = data?.resources?.results?.products;
    if (!Array.isArray(products) || products.length === 0) return null;
    const match =
      products.find((p) => String(p.id) === String(productId)) || products[0];
    if (!match?.handle) return null;

    const product = await fetchJson(`/products/${match.handle}.js`);
    if (!product) return null;

    return {
      id: String(product.id),
      title: product.title,
      url: `/products/${product.handle}`,
      image: product.featured_image || "",
      price: product.price,
    };
  };

  const renderEmpty = (emptyTitle, emptySubtitle) => `
    <div class="favoritos-list-empty">
      <p><strong>${escapeHtml(emptyTitle)}</strong></p>
      <p>${escapeHtml(emptySubtitle)}</p>
    </div>
  `;

  const renderLogin = (message, loginHref, buttonLabel) => `
    <div class="favoritos-list-login">
      <p>${escapeHtml(message)}</p>
      <a href="${escapeHtml(loginHref)}">${escapeHtml(buttonLabel)}</a>
    </div>
  `;

  const renderCard = ({
    title,
    url,
    image,
    price,
    showPrice,
    showButton,
    buttonText,
    moneyFormat,
  }) => {
    const imageHtml = image
      ? `<a href="${escapeHtml(url)}"><img class="favoritos-list-image" src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy"></a>`
      : "";
    const priceHtml = showPrice
      ? `<p>${escapeHtml(formatMoney(typeof price === "number" ? price : 0, moneyFormat))}</p>`
      : "";
    const buttonHtml = showButton
      ? `<a class="favoritos-list-cta" href="${escapeHtml(url)}">${escapeHtml(buttonText)}</a>`
      : "";

    return `
      <article class="favoritos-list-card">
        ${imageHtml}
        <div class="favoritos-list-content">
          <h3><a href="${escapeHtml(url)}">${escapeHtml(title)}</a></h3>
          ${priceHtml}
          ${buttonHtml}
        </div>
      </article>
    `;
  };

  roots.forEach(async (root) => {
    const grid = root.querySelector(".favoritos-list-grid");
    if (!(grid instanceof HTMLElement)) return;

    const customerId = root.dataset.customerId || "";
    const loginUrl = root.dataset.loginUrl || "/account/login";
    const payload = root.dataset.favoritesPayload || "";
    const moneyFormat = root.dataset.moneyFormat || "${{amount}}";
    const showPrice = root.dataset.showPrice === "true";
    const showButton = root.dataset.showButton === "true";
    const buttonText = root.dataset.buttonText || "Ver produto";
    const emptyTitle = root.dataset.emptyTitle || "Ainda não há favoritos.";
    const emptySubtitle = root.dataset.emptySubtitle || "";
    const loginMessage = root.dataset.loginMessage || "Inicie sessão para ver os favoritos.";
    const loginButtonLabel = root.dataset.loginButtonLabel || "Fazer login";
    const loadingLabel = root.dataset.loadingLabel || "A carregar favoritos...";

    if (!customerId) {
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      grid.innerHTML = renderLogin(loginMessage, `${loginUrl}?return_url=${returnUrl}`, loginButtonLabel);
      return;
    }

    grid.innerHTML = `<div class="favoritos-list-loading">${escapeHtml(loadingLabel)}</div>`;

    const productIds = parsePayload(payload);
    if (!productIds.length) {
      grid.innerHTML = renderEmpty(emptyTitle, emptySubtitle);
      return;
    }

    try {
      const cards = await Promise.all(productIds.map((id) => fetchProductCard(id)));
      const validCards = cards.filter((card) => card && card.url && card.title);
      if (!validCards.length) {
        grid.innerHTML = renderEmpty(emptyTitle, emptySubtitle);
        return;
      }

      grid.innerHTML = validCards
        .map((card) =>
          renderCard({
            ...card,
            showPrice,
            showButton,
            buttonText,
            moneyFormat,
          }),
        )
        .join("");
    } catch (error) {
      console.error("[customer-favorites] fail_to_render", error);
      grid.innerHTML = renderEmpty(emptyTitle, emptySubtitle);
    }
  });
})();
