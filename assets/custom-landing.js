/**
 * custom-landing.js
 * - Quick view popup
 * - Render variants dynamically
 * - Add to cart via /cart/add.js
 * - Auto-add soft winter variant when Black + Medium are selected
 */

(function () {
  // Utility to create element
  function el(tag, cls) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }

  // Delegate click on hotspot buttons
  document.addEventListener('click', function (evt) {
    var btn = evt.target.closest('.ce-hotspot-button');
    if (!btn) return;
    var card = btn.closest('.ce-product-card');
    if (!card) return;
    var json = card.querySelector('.ce-product-json');
    if (!json) return;
    var product = JSON.parse(json.textContent);
    openProductModal(product);
  });

  // Add variant to cart via AJAX
  function addVariantToCart(variantId, qty) {
    return fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: variantId, quantity: qty || 1 })
    }).then(function (res) {
      if (!res.ok) return res.json().then(function (err) { throw err; });
      return res.json();
    });
  }

  // Build and open product modal
  function openProductModal(product) {
    // Create modal structure
    var modal = el('div', 'ce-modal');
    var overlay = el('div', 'ce-modal__overlay');
    var panel = el('div', 'ce-modal__panel');

    overlay.addEventListener('click', closeModal);
    modal.appendChild(overlay);
    modal.appendChild(panel);

    // Left image
    var left = el('div', 'ce-modal__left');
    var img = el('img');
    img.src = (product.images && product.images.length) ? product.images[0] : '';
    left.appendChild(img);

    // Right content
    var right = el('div', 'ce-modal__right');
    var title = el('h2', 'ce-modal__title'); title.textContent = product.title;
    var price = el('div', 'ce-modal__price'); price.textContent = (product.variants[0] ? (product.variants[0].price + ' ') : '');
    var desc = el('div'); desc.innerHTML = product.body_html || '';

    // Build selects for options
    var selects = [];
    for (var i = 0; i < product.options.length; i++) {
      var label = el('label'); label.textContent = product.options[i];
      var select = el('select', 'ce-variant-select');
      product.variants.forEach(function (v) {
        var value = v['option' + (i + 1)];
        // ensure option exists in this select
        if (!Array.from(select.options).some(function (o) { return o.value === value; })) {
          var opt = el('option');
          opt.value = value;
          opt.textContent = value;
          select.appendChild(opt);
        }
      });
      selects.push(select);
      select.addEventListener('change', updateSelectedVariant);
      right.appendChild(label);
      right.appendChild(select);
    }

    // Quantity & Add button
    var qtyLabel = el('label'); qtyLabel.textContent = 'Quantity';
    var qty = el('input'); qty.type = 'number'; qty.value = 1; qty.min = 1; qty.style.width = '80px'; qty.style.marginBottom = '12px';
    var addBtn = el('button', 'ce-btn'); addBtn.textContent = 'ADD TO CART';

    // Append nodes
    right.appendChild(title);
    right.appendChild(price);
    right.appendChild(desc);
    right.appendChild(qtyLabel);
    right.appendChild(qty);
    right.appendChild(addBtn);

    panel.appendChild(left);
    panel.appendChild(right);
    document.body.appendChild(modal);

    // Keep track of current matched variant
    var currentVariant = product.variants[0];

    // Initialize selects to first variant's options
    if (currentVariant) {
      for (var si = 0; si < selects.length; si++) {
        selects[si].value = currentVariant['option' + (si + 1)];
      }
      price.textContent = formatMoney(currentVariant.price);
    }

    // When selects change, find matching variant
    function updateSelectedVariant() {
      var selected = selects.map(function (s) { return s.value; });
      var matched = product.variants.find(function (v) {
        for (var i = 0; i < selected.length; i++) {
          if (v['option' + (i + 1)] !== selected[i]) return false;
        }
        return true;
      });
      if (matched) {
        currentVariant = matched;
        price.textContent = formatMoney(matched.price);
      }
    }

    // Add to cart click handler
    addBtn.addEventListener('click', function () {
      if (!currentVariant) {
        alert('Please select a variant');
        return;
      }
      addBtn.disabled = true;
      addBtn.textContent = 'Adding...';
      addVariantToCart(currentVariant.id, parseInt(qty.value, 10) || 1).then(function () {
        // After main product added, check Black + Medium rule
        var selectedOptions = [currentVariant.option1, currentVariant.option2, currentVariant.option3].filter(Boolean);
        var hasBlack = selectedOptions.some(function (o) { return (o || '').toLowerCase() === 'black'; });
        var hasMedium = selectedOptions.some(function (o) { return (o || '').toLowerCase() === 'medium'; });
        var softVar = window.__ce_softWinterVariant || null;

        if (hasBlack && hasMedium && softVar) {
          // Add soft winter variant
          return addVariantToCart(softVar, 1).then(function () {
            showToast('Added to cart (plus Soft Winter Jacket)');
            addBtn.textContent = 'Added';
            setTimeout(closeModal, 700);
          }).catch(function () {
            showToast('Added main item, but failed to add Soft Winter Jacket');
            addBtn.textContent = 'Added';
            setTimeout(closeModal, 700);
          });
        } else {
          showToast('Added to cart');
          addBtn.textContent = 'Added';
          setTimeout(closeModal, 700);
        }
      }).catch(function (err) {
        console.error('Add to cart error', err);
        addBtn.disabled = false;
        addBtn.textContent = 'Add to cart';
        var msg = (err && err.description) ? err.description : 'Could not add item to cart.';
        alert(msg);
      });
    });

    // Helper: close modal
    function closeModal() {
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    }

    // Close on ESC
    function onKey(e) {
      if (e.key === 'Escape') closeModal();
    }
    document.addEventListener('keydown', onKey);

    // Cleanup when modal removed
    modal.addEventListener('remove', function () {
      document.removeEventListener('keydown', onKey);
    });

    // Toast
    function showToast(text) {
      var t = el('div', 'ce-toast');
      t.textContent = text;
      document.body.appendChild(t);
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
    }

    // Money formatting: product.price is a string like "29.99" (Shopify's product JSON returns price in cents sometimes)
    function formatMoney(price) {
      // product JSON returned from Liquid already uses money in string or cents; attempt to show readable value
      if (!price) return '';
      // If price looks like "1999" (cents), convert:
      var p = String(price);
      if (p.length > 3 && !p.includes('.')) {
        // assume cents
        return (parseInt(p, 10) / 100).toFixed(2);
      }
      return p;
    }
  }

})();