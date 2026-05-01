const fs = require('fs');
const path = require('path');
const vm = require('vm');

// --- 1. Load Data ---
console.log("Reading site_data.js...");
const dataJsContent = fs.readFileSync('site_data.js', 'utf8');

// Append assignment to ensure we capture const/let variables which are not automatically attached to sandbox
const scriptContent = dataJsContent + `
;
this.siteConfig = siteConfig;
this.categories = categories;
this.reviewsData = reviewsData;
this.products = products;
this.blogs = blogs || [];
try { this.gradients = gradients; } catch(e) {}
`;

// Use VM to execute the data file safely to extract variables
const sandbox = { 
    console: console, // Allow logging if any
    document: {}, // Mock document if needed to prevent reference errors during parsing
    window: {},
    alert: () => {},
    confirm: () => false
};
vm.createContext(sandbox);

try {
    vm.runInContext(scriptContent, sandbox);
} catch (e) {
    console.error("Error parsing site_data.js:", e);
    process.exit(1);
}

const siteConfig = sandbox.siteConfig;
const categories = sandbox.categories;
const reviewsData = sandbox.reviewsData;
const productsRaw = sandbox.products;
const products = productsRaw ? productsRaw.filter(p => p.active !== false) : [];
const blogs = sandbox.blogs || [];
const gradients = sandbox.gradients || {}; // gradients might be missing or defined elsewhere

// --- URL Configuration ---
const baseUrl = siteConfig.baseUrl || 'https://pvaitshop.com/';
const paths = siteConfig.pathConfig || {
    product: 'product',
    category: 'category',
    blog: 'blog',
    sitemap: 'sitemap.xml'
};

/**
 * Helper to construct URLs dynamically from site_data.js config
 */
function getDynamicUrl(type, slug = '', isAbsolute = true) {
    const base = paths[type] || type;
    const cleanSlug = slug.replace(/^\/+|\/+$/g, '');
    
    let urlPath = '';
    if (type === 'home') {
        urlPath = '/';
    } else if (!cleanSlug) {
        urlPath = `/${base}/`;
    } else {
        urlPath = `/${base}/${cleanSlug}/`;
    }

    // Fix double slashes
    urlPath = urlPath.replace(/\/+/g, '/');

    if (isAbsolute) {
        return `${baseUrl.replace(/\/+$/, '')}${urlPath}`;
    }
    return urlPath;
}

if (!products || !siteConfig) {
    console.error("Failed to load data from site_data.js");
    process.exit(1);
}

console.log(`Loaded ${products.length} products and ${blogs.length} blog posts.`);
const assetVersion = Date.now().toString();

// --- Load Templates ---
const headerHtml = fs.readFileSync('header_partial.html', 'utf8');

// --- 2. Helper Functions ---

/**
 * Recursively deletes a directory and its contents
 * Robust version for Windows
 */
function cleanDirectory(dir) {
    if (fs.existsSync(dir)) {
        console.log(`Cleaning directory: ${dir}`);
        try {
            fs.rmSync(dir, { recursive: true, force: true });
        } catch (err) {
            console.warn(`Initial cleaning of ${dir} failed, retrying...`);
            // Small delay and retry for Windows file locks
            try {
                // On Windows, sometimes directories are "busy" for a split second
                // We'll try to delete contents individually if rmSync fails
                const files = fs.readdirSync(dir);
                for (const file of files) {
                    const curPath = path.join(dir, file);
                    if (fs.lstatSync(curPath).isDirectory()) {
                        cleanDirectory(curPath);
                    } else {
                        fs.unlinkSync(curPath);
                    }
                }
                fs.rmdirSync(dir);
            } catch (retryErr) {
                console.error(`Failed to clean directory ${dir}:`, retryErr.message);
            }
        }
    }
}

function generateFooter(products, siteConfig, basePath = '/') {
    // Group products by category
    const categoriesGrouped = {};
    products.forEach(p => {
        if (!categoriesGrouped[p.category]) categoriesGrouped[p.category] = [];
        categoriesGrouped[p.category].push(p);
    });

    // Link to real category pages
    const categoryLinks = Object.keys(categoriesGrouped).slice(0, 5).map(catName => {
        const catData = categories.find(c => c.name === catName);
        if (!catData || !catData.slug) return '';
        const url = getDynamicUrl('category', catData.slug, false);
        return `<li><a href="${url}" class="text-slate-500 hover:text-cyan-600 transition-colors text-sm">${catName}</a></li>`;
    }).filter(Boolean).join('');

    const popularProducts = products.filter(p => p.is_sale).slice(0, 5).map(p => {
        const url = getDynamicUrl('product', p.slug, false);
        return `<li><a href="${url}" class="text-slate-500 hover:text-cyan-600 transition-colors text-sm">${p.display_title || p.title}</a></li>`;
    }).join('');

    const logoContent = siteConfig.logoUrl 
        ? `<img src="${getImageUrl(siteConfig.logoUrl, basePath) || siteConfig.logoUrl}" alt="${siteConfig.logoText || 'Logo'}" class="h-8 w-auto" loading="lazy" decoding="async" width="32" height="32"> <span class="logo-text text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-blue-600 font-extrabold text-2xl tracking-tight">${siteConfig.logoText || 'pvaitshop'}</span>`
        : `<span class="text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-blue-600 font-extrabold text-2xl tracking-tight">{{LOGO_TEXT}}</span>`;

    const siteDomain = (siteConfig.siteTitle || 'pvaitshop').toLowerCase().replace(/\s+/g, '') + '.com';

    return `
        <div class="max-w-7xl mx-auto px-4">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                <div class="col-span-1 md:col-span-1">
                    <div class="flex items-center gap-2 mb-4">
                        ${logoContent}
                    </div>
                    <p class="text-slate-600 text-sm leading-relaxed mb-4">
                        {{META_DESCRIPTION}}
                    </p>
                    <div class="flex gap-3">
                        <a href="https://facebook.com/${siteDomain.split('.')[0]}" target="_blank" rel="nofollow" class="text-slate-400 hover:text-cyan-600 transition-colors" aria-label="Facebook"><i data-lucide="facebook" class="w-5 h-5"></i></a>
                        <a href="https://x.com/${siteDomain.split('.')[0]}" target="_blank" rel="nofollow" class="text-slate-400 hover:text-cyan-600 transition-colors" aria-label="X (Twitter)"><i data-lucide="twitter" class="w-5 h-5"></i></a>
                        <a href="https://t.me/${(siteConfig.telegram || '').replace('@','')}" target="_blank" rel="nofollow" class="text-slate-400 hover:text-cyan-600 transition-colors" aria-label="Telegram"><i data-lucide="send" class="w-5 h-5"></i></a>
                        <a href="{{WHATSAPP_LINK}}" target="_blank" rel="nofollow" class="text-slate-400 hover:text-green-500 transition-colors" aria-label="WhatsApp"><i data-lucide="message-circle" class="w-5 h-5"></i></a>
                        <a href="mailto:{{SUPPORT_EMAIL}}" class="text-slate-400 hover:text-red-500 transition-colors" aria-label="Email"><i data-lucide="mail" class="w-5 h-5"></i></a>
                    </div>
                </div>
                
                <div>
                    <h4 class="text-slate-900 font-bold mb-4">Solutions</h4>
                    <ul class="space-y-2">
                        ${categoryLinks}
                    </ul>
                </div>

                <div>
                    <h4 class="text-slate-900 font-bold mb-4">Top Services</h4>
                    <ul class="space-y-2">
                        ${popularProducts}
                    </ul>
                </div>

                <div>
                    <h4 class="text-slate-900 font-bold mb-4">Get in Touch</h4>
                    <ul class="space-y-2 text-sm text-slate-500">
                        <li class="flex items-center gap-2">
                            <i data-lucide="mail" class="w-4 h-4 text-cyan-500"></i> 
                            <a href="mailto:{{SUPPORT_EMAIL}}" class="hover:text-cyan-600 transition-colors">{{SUPPORT_EMAIL}}</a>
                        </li>
                        <li class="flex items-center gap-2">
                            <i data-lucide="phone" class="w-4 h-4 text-green-500"></i> 
                            <a href="{{WHATSAPP_LINK}}" target="_blank" rel="nofollow" class="hover:text-green-600 transition-colors">{{WHATSAPP}}</a>
                        </li>
                        <li class="flex items-center gap-2">
                            <i data-lucide="send" class="w-4 h-4 text-blue-500"></i> 
                            <a href="{{TELEGRAM_LINK}}" target="_blank" rel="nofollow" class="hover:text-blue-600 transition-colors">@{{TELEGRAM}}</a>
                        </li>
                    </ul>
                </div>
            </div>
            
            <div class="border-t border-slate-200 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <p class="text-slate-500 text-sm">Copyright © ${new Date().getFullYear()} ${siteDomain}. All rights reserved.</p>
                <div class="flex gap-4 text-sm text-slate-500">
                    <a href="${getDynamicUrl('blog', '', false)}" class="hover:text-cyan-600 transition-colors">Blog</a>
                    <a href="#" class="hover:text-cyan-600 transition-colors">Privacy Policy</a>
                    <a href="#" class="hover:text-cyan-600 transition-colors">Terms of Service</a>
                </div>
            </div>
        </div>
    `;
}

function generateLatestArticlesHtml(blogs) {
    if (!blogs || blogs.length === 0) return '';
    const latest = blogs.slice(0, 3);
    const cards = latest.map(b => `
        <div class="group relative flex flex-col items-start bg-white p-6 rounded-2xl border border-slate-200 hover:border-cyan-300 hover:shadow-md transition-all">
            <div class="flex items-center gap-x-4 text-xs mb-3">
                <time datetime="${b.date}" class="text-slate-500">${b.date}</time>
                <span class="relative z-10 rounded-full bg-cyan-100 px-3 py-1.5 font-medium text-cyan-600">Article</span>
            </div>
            <h3 class="mt-0 text-lg font-bold leading-6 text-slate-900 group-hover:text-cyan-600 transition-colors">
                <a href="${getDynamicUrl('blog', b.slug, false)}">
                    <span class="absolute inset-0"></span>
                    ${b.title}
                </a>
            </h3>
            <p class="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">${b.excerpt}</p>
            <div class="mt-4 flex items-center gap-1 text-cyan-600 text-sm font-bold">
                Continue Reading <i data-lucide="arrow-right" class="w-4 h-4"></i>
            </div>
        </div>
    `).join('');

    return `
    <section class="py-16 bg-slate-50 border-t border-slate-200">
        <div class="mx-auto max-w-7xl px-4">
            <div class="flex items-center justify-between mb-10">
                <div>
                    <h2 class="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Recent <span class="text-cyan-600">Insights</span></h2>
                    <p class="mt-2 text-lg leading-8 text-slate-600">Strategies, tips, and updates for maximizing your digital presence.</p>
                </div>
                <a href="${getDynamicUrl('blog', '', false)}" class="hidden sm:flex items-center gap-1 text-cyan-600 font-bold hover:text-cyan-500 transition-colors">Read All <i data-lucide="arrow-right" class="w-4 h-4"></i></a>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                ${cards}
            </div>
            <div class="mt-8 text-center sm:hidden">
                 <a href="${getDynamicUrl('blog', '', false)}" class="inline-flex items-center gap-1 text-cyan-600 font-bold hover:text-cyan-500 transition-colors">Read All Insights <i data-lucide="arrow-right" class="w-4 h-4"></i></a>
            </div>
        </div>
    </section>
    `;
}

function generateRelatedArticlesHtml(product, blogs) {
    if (!blogs || blogs.length === 0) return '';
    
    // 1. Priority: Explicitly related blogs (via related_ids in blog object)
    let related = blogs.filter(b => b.related_ids && b.related_ids.includes(product.id));

    // 2. Fallback: Contextual matching (Category/Title keywords)
    if (related.length < 3) {
        const productKeywords = product.category.toLowerCase().split(/[\s&]+/);
        const contextual = blogs.filter(b => {
            // Avoid duplicates
            if (related.some(rel => rel.id === b.id)) return false;
            
            const titleLower = b.title.toLowerCase();
            return productKeywords.some(k => titleLower.includes(k));
        });
        
        related = [...related, ...contextual];
    }

    const displayBlogs = related.slice(0, 3);
    
    if (displayBlogs.length === 0) return '';

    const title = 'Related Articles';

    const cards = displayBlogs.map(b => {
        const url = getDynamicUrl('blog', b.slug, false);
        return `
        <div class="group relative flex flex-col items-start bg-white p-6 rounded-2xl border border-slate-200 hover:border-cyan-300 hover:shadow-md transition-all">
            <h3 class="text-lg font-bold leading-6 text-slate-900 group-hover:text-cyan-600 transition-colors">
                <a href="${url}">
                    <span class="absolute inset-0"></span>
                    ${b.title}
                </a>
            </h3>
            <p class="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">${b.excerpt}</p>
             <div class="mt-4 text-cyan-600 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                Read Article <i data-lucide="arrow-right" class="w-3 h-3"></i>
            </div>
        </div>
    `}).join('');

    return `
    <div class="mt-16 border-t border-slate-200 pt-12">
        <div class="flex items-center justify-between mb-8">
            <h2 class="text-2xl font-bold text-slate-900">${title}</h2>
            <a href="${getDynamicUrl('blog', '', false)}" class="text-cyan-600 text-sm font-bold hover:underline">View Blog</a>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${cards}
        </div>
    </div>
    `;
}

function generateSocialShare(product) {
    const url = getDynamicUrl('product', product.slug, true);
    const title = encodeURIComponent(product.title);
    
    return `
        <a href="https://www.facebook.com/sharer/sharer.php?u=${url}" target="_blank" rel="noopener noreferrer" class="p-2 bg-[#1877F2]/10 hover:bg-[#1877F2]/20 text-[#1877F2] rounded-lg transition-colors" aria-label="Share on Facebook">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
        </a>
        <a href="https://twitter.com/intent/tweet?text=${title}&url=${url}" target="_blank" rel="noopener noreferrer" class="p-2 bg-[#1DA1F2]/10 hover:bg-[#1DA1F2]/20 text-[#1DA1F2] rounded-lg transition-colors" aria-label="Share on Twitter">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path></svg>
        </a>
        <a href="https://wa.me/?text=${title}%20${url}" target="_blank" rel="noopener noreferrer" class="p-2 bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366] rounded-lg transition-colors" aria-label="Share on WhatsApp">
            <i data-lucide="message-circle" class="w-5 h-5"></i>
        </a>
        <a href="https://t.me/share/url?url=${url}&text=${title}" target="_blank" rel="noopener noreferrer" class="p-2 bg-[#0088cc]/10 hover:bg-[#0088cc]/20 text-[#0088cc] rounded-lg transition-colors" aria-label="Share on Telegram">
            <i data-lucide="send" class="w-5 h-5"></i>
        </a>
    `;
}

function replaceGlobalPlaceholders(html, siteConfig) {
    let output = html;
    output = output.replace(/{{WHATSAPP}}/g, siteConfig.whatsapp || '');
    output = output.replace(/{{TELEGRAM}}/g, (siteConfig.telegram || '').replace('@', ''));
    output = output.replace(/{{WHATSAPP_LINK}}/g, `https://wa.me/${(siteConfig.whatsapp || '').replace(/[^0-9]/g, '')}`);
    output = output.replace(/{{TELEGRAM_LINK}}/g, `https://t.me/${(siteConfig.telegram || '').replace('@', '')}`);
    output = output.replace(/{{SUPPORT_EMAIL}}/g, siteConfig.supportEmail || '');
    
    // Google Analytics rendering
    let analyticsScript = '';
    if (siteConfig.analyticsId && siteConfig.analyticsId.trim() !== '') {
        analyticsScript = `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${siteConfig.analyticsId}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${siteConfig.analyticsId}');
    </script>`;
    }
    output = output.replace(/{{ANALYTICS_SCRIPT}}/g, analyticsScript);
    output = output.replace(/{{ANALYTICS_ID}}/g, siteConfig.analyticsId || '');
    
    output = output.replace(/{{SITE_TITLE}}/g, siteConfig.siteTitle || 'pvaitshop');
    output = output.replace(/{{SITE_NAME}}/g, siteConfig.siteTitle || 'pvaitshop');
    output = output.replace(/{{SITE_DOMAIN}}/g, (siteConfig.siteTitle || 'pvaitshop').toLowerCase().replace(/\s+/g, '') + '.com');
    output = output.replace(/{{META_DESCRIPTION}}/g, siteConfig.metaDescription || '');
    output = output.replace(/{{LOGO_TEXT}}/g, siteConfig.logoText || 'pvaitshop');
    output = output.replace(/{{LOGO_BADGE}}/g, siteConfig.logoBadge || '');
    output = output.replace(/{{FAVICON_URL}}/g, siteConfig.faviconUrl || '/favicon.svg');
    output = output.replace(/{{LOGO_URL}}/g, siteConfig.logoUrl || '/favicon.svg');
    output = output.replace(/{{HERO_TITLE}}/g, siteConfig.heroTitle || '');
    output = output.replace(/{{HERO_SUBTITLE}}/g, siteConfig.heroSubtitle || '');
    output = output.replace(/{{HERO_BUTTON_TEXT}}/g, siteConfig.heroButtonText || 'Browse Our Services');
    output = output.replace(/{{POPUP_TITLE}}/g, siteConfig.popupTitle || 'Reach Out to Us');
    output = output.replace(/{{POPUP_MESSAGE}}/g, siteConfig.popupMessage || "Need assistance? Our experts are available 24/7.");
    output = output.replace(/{{BADGE_TEXT}}/g, siteConfig.badgeText || 'Top-Tier PVA Accounts & Authentic Reviews');
    output = output.replace(/{{ASSET_VERSION}}/g, assetVersion);
    
    // Handle Canonical URL dynamically
    output = output.replace(/{{CANONICAL_URL}}/g, getDynamicUrl('home'));
    
    return output;
}

function minifyHTML(html) {
    if (!html) return '';
    return html
        .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
        .replace(/\s+/g, ' ')            // Collapse whitespace
        .replace(/>\s+</g, '><')         // Remove space between tags
        .trim();
}

function minifyCSS(css) {
    if (!css) return '';
    return css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*([{}:;,>])\s*/g, '$1')
        .replace(/;}/g, '}')
        .trim();
}

function renderStars(rating = 5, sizeClass = "w-4 h-4") {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        const isFull = i <= rating;
        const color = isFull ? '#facc15' : 'currentColor';
        const fill = isFull ? '#facc15' : 'none';
        const textClass = isFull ? 'text-yellow-400' : 'text-slate-600';
        html += `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-star ${sizeClass} ${textClass}"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    }
    return html;
}

function getImageUrl(img, basePath = '/') {
    if (!img) return null;
    const normalizeLocalWebp = (rawPath) => {
        const qIndex = rawPath.indexOf('?');
        const hIndex = rawPath.indexOf('#');
        let cutIndex = -1;
        if (qIndex !== -1 && hIndex !== -1) cutIndex = Math.min(qIndex, hIndex);
        else cutIndex = qIndex !== -1 ? qIndex : hIndex;
        const base = cutIndex === -1 ? rawPath : rawPath.slice(0, cutIndex);
        const suffix = cutIndex === -1 ? '' : rawPath.slice(cutIndex);
        if (/\.(png|jpe?g)$/i.test(base)) {
            return base.replace(/\.(png|jpe?g)$/i, '.webp') + suffix;
        }
        return rawPath;
    };
    if (img.startsWith('http') || img.startsWith('data:')) return img;
    img = normalizeLocalWebp(img);
    
    // Convert absolute paths to relative if basePath is provided
    if (img.startsWith('/images/products/')) {
        img = img.substring('/images/products/'.length);
    } else if (img.startsWith('/')) {
        return basePath === '/' ? img : basePath + img.substring(1);
    }
    
    return `${basePath}images/products/${img}`;
}

function getProductSeed(product) {
    const n = Number(product && product.id);
    if (Number.isFinite(n)) return n;
    const str = String((product && (product.slug || product.title)) || '');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return hash;
}

function hslToHex(h, s, l) {
    const sat = s / 100;
    const light = l / 100;
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const hp = ((h % 360) + 360) % 360 / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r1 = 0, g1 = 0, b1 = 0;
    if (hp >= 0 && hp < 1) { r1 = c; g1 = x; b1 = 0; }
    else if (hp >= 1 && hp < 2) { r1 = x; g1 = c; b1 = 0; }
    else if (hp >= 2 && hp < 3) { r1 = 0; g1 = c; b1 = x; }
    else if (hp >= 3 && hp < 4) { r1 = 0; g1 = x; b1 = c; }
    else if (hp >= 4 && hp < 5) { r1 = x; g1 = 0; b1 = c; }
    else { r1 = c; g1 = 0; b1 = x; }
    const m = light - c / 2;
    const r = Math.round((r1 + m) * 255);
    const g = Math.round((g1 + m) * 255);
    const b = Math.round((b1 + m) * 255);
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

function computeProductColor(product) {
    const seed = getProductSeed(product);
    const hue = (seed * 137.508) % 360;
    /* Increased lightness for better vibrancy */
    return hslToHex(hue, 65, 45);
}

function renderProductCard(product, basePath = '/') {
    const fullImgUrl = getImageUrl(product.image, basePath);
    const imageHtml = fullImgUrl 
        ? `<img src="${fullImgUrl}" alt="${product.image_title || product.title}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" decoding="async" width="400" height="300">`
        : '';
    const solidColor = computeProductColor(product);
    const overlayClass = fullImgUrl ? '' : 'bg-black/0 group-hover:bg-black/0';
    const productUrl = getDynamicUrl('product', product.slug, false);
    const overlayTitle = (product.display_title && product.display_title.trim().length > 0)
        ? product.display_title
        : product.title.replace(/^Buy\s+/i, '');

    const overlayLayerHtml = fullImgUrl ? '' : `<div class="absolute inset-0 ${overlayClass} transition-colors duration-300"></div>`;
    const overlayTextHtml = fullImgUrl ? '' : `
            <div class="absolute top-3 left-3 bg-red-500/90 backdrop-blur-md border border-white/20 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1 shadow-lg z-10">
                <span class="text-yellow-300 text-sm">Sale!</span> pvaitshop
            </div>
            
            <h3 class="text-xl font-bold leading-tight text-white mb-4 drop-shadow-lg z-10 relative">${overlayTitle}</h3>
            
            <a href="${productUrl}" class="bg-white/10 backdrop-blur-md border border-white/20 text-white text-xs font-bold px-5 py-2 rounded-full mb-2 cursor-pointer hover:bg-white/20 hover:scale-105 transition-all block text-center no-underline z-10">
                GET STARTED
            </a>
    `;
    
    return `
    <div class="card-glow bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300 group hover:-translate-y-2 hover:shadow-md" style="content-visibility: auto; contain-intrinsic-size: 0 350px;">
        <div role="img" aria-label="${product.image_title || product.title}" class="relative p-6 h-52 flex flex-col items-center justify-center text-center overflow-hidden" style="background-color: ${solidColor};">
            ${imageHtml}
            ${overlayLayerHtml}
            ${overlayTextHtml}
        </div>
        
        <div class="p-5">
            <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold text-cyan-600 bg-cyan-50 px-2.5 py-1 rounded uppercase tracking-wider">${product.category}</span>
                <div class="flex items-center gap-0.5">
                    ${renderStars(5, "w-3 h-3")}
                </div>
            </div>
            
            <a href="${productUrl}" class="font-bold text-slate-900 mb-3 text-sm hover:text-cyan-600 transition-colors block line-clamp-2 min-h-[40px]">
                ${overlayTitle}
            </a>
            
            <div class="flex items-center justify-between mb-5">
                <p class="text-slate-500 text-xs">As low as</p>
                <p class="text-slate-900 font-extrabold text-lg">
                    $${product.min_price.toFixed(2)}
                </p>
            </div>
            
            <a href="${productUrl}" class="block w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl py-3 text-center text-sm shadow-sm transition-all hover:shadow-md">
                View Details
            </a>
        </div>
    </div>`;
}

function generateRichDescription(product) {
    if (product.long_description) return product.long_description;
    
    const productName = product.title;
    return `
        <h2 class="text-xl md:text-2xl font-bold text-slate-900 mb-4">${productName} – Safe Online & Trusted Account</h2>
        <p class="mb-4">
            In the modern world of online business, having a reliable <strong>${productName}</strong> is crucial. 
            Whether you are an entrepreneur, a digital marketer, or a freelancer, verified accounts provide the stability and credibility you need. 
            At <strong class="text-cyan-600">pvaitshop</strong>, we provide premium, fully verified ${productName} that are ready to use. 
            Our accounts are safe, secure, and come with a replacement guarantee.
        </p>

        <h3 class="text-lg font-bold text-slate-900 mb-3 mt-8">Why is a ${productName} Best For Online Business?</h3>
        <p class="mb-4">
            Efficiency and authenticity are key factors for online success. Using verified accounts ensures that your business operations run smoothly without interruptions. 
            A ${productName} allows you to access features that might be restricted on unverified or new accounts.
        </p>
        <ul class="list-disc pl-5 space-y-2 mb-6 text-slate-700">
            <li><strong>Instant Access:</strong> No waiting time, get started immediately.</li>
            <li><strong>High Trust Score:</strong> Verified accounts carry more authority.</li>
            <li><strong>Security:</strong> Reduced risk of suspension or bans.</li>
        </ul>

        <h3 class="text-lg font-bold text-slate-900 mb-3 mt-8">Buy Trusted ${productName} For Secure Operations</h3>
        <p class="mb-4">
            When it comes to online transactions or marketing, security is paramount. 
            Buying trusted ${productName} from us ensures that you get a clean, high-quality account. 
            We use unique IPs and real device fingerprints to create these accounts, ensuring they look natural and authentic.
        </p>

        <h3 class="text-lg font-bold text-slate-900 mb-3 mt-8">How to Buy ${productName} Safely (Practical Steps)</h3>
        <p class="mb-4">
            When choosing a provider, safety should be your top priority. Here is why we are the best choice:
        </p>
        <ol class="list-decimal pl-5 space-y-2 mb-6 text-slate-700">
            <li><strong>Select Your Package:</strong> Choose the ${productName} package that fits your needs.</li>
            <li><strong>Secure Payment:</strong> We accept various secure payment methods including Crypto.</li>
            <li><strong>Instant Delivery:</strong> Receive your account details via email shortly after purchase.</li>
            <li><strong>24/7 Support:</strong> Our team is always ready to assist you.</li>
        </ol>

        <h3 class="text-lg font-bold text-slate-900 mb-3 mt-8">Conclusion</h3>
        <p class="mb-4">
            In conclusion, buying a ${productName} from pvaitshop is a smart investment for your digital growth. 
            Save time, avoid hassles, and focus on scaling your business while we handle the technicalities. 
            Order your ${productName} today and experience the difference!
        </p>
    `;
}

function generateFullHeader(unused_basePath, products, categories, siteConfig) {
    let header = fs.readFileSync('header_partial.html', 'utf8');
    
    // 1. Populate Desktop Nav
    let desktopNavHtml = `<a href="/" class="text-slate-600 hover:text-cyan-600 hover:bg-slate-50 rounded-lg transition-colors text-sm font-medium px-4 py-2">Shop</a>`;
    
    categories.forEach(cat => {
        const catItemsHtml = cat.items.map(item => {
            const p = products.find(prod => prod.slug === item || prod.title === item || prod.image_title === item || prod.display_title === item);
            const url = p ? getDynamicUrl('product', p.slug, false) : '#';
            const displayText = p ? (p.display_title || p.title) : item;
            return `<a href="${url}" class="block px-4 py-2.5 text-sm text-slate-600 hover:text-cyan-600 hover:bg-slate-50 transition-colors">${displayText}</a>`;
        }).join('');

        desktopNavHtml += `
            <div class="relative group px-3 py-2">
                <button class="text-slate-600 group-hover:text-cyan-600 text-sm font-medium flex items-center gap-1 transition-colors">
                    ${cat.name} <i data-lucide="chevron-down" class="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity"></i>
                </button>
                <div class="absolute left-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-2xl py-2 hidden group-hover:block z-50 backdrop-blur-xl max-h-96 overflow-y-auto">
                    ${catItemsHtml}
                </div>
            </div>
        `;
    });

    desktopNavHtml += `
        <a href="${getDynamicUrl('blog', '', false)}" class="text-slate-600 hover:text-cyan-600 hover:bg-slate-50 rounded-lg transition-colors text-sm font-medium px-4 py-2">Blog</a>
    `;

    // 2. Populate Mobile Nav
    let mobileNavHtml = `
        <a href="${getDynamicUrl('blog', '', false)}" class="block px-4 py-3 text-cyan-600 font-bold bg-cyan-50 border border-cyan-200 rounded-xl mb-4 hover:bg-cyan-100 transition-all">
            <span class="flex items-center gap-2"><i data-lucide="book-open" class="w-4 h-4 text-cyan-600"></i> Blog</span>
        </a>
    `;

    categories.forEach(cat => {
        if (!cat.slug) return;
        const catSlug = cat.slug;
        const catItemsHtml = cat.items.map(item => {
            const p = products.find(prod => prod.slug === item || prod.title === item || prod.image_title === item || prod.display_title === item);
            const url = p ? getDynamicUrl('product', p.slug, false) : '#';
            const displayText = p ? (p.display_title || p.title) : item;
            return `<a href="${url}" class="block px-4 py-2 text-slate-600 hover:text-cyan-600 hover:bg-slate-50 rounded-lg transition-colors text-sm">${displayText}</a>`;
        }).join('');

        mobileNavHtml += `
            <div class="mb-2">
                <button class="mobile-cat-toggle w-full flex items-center justify-between px-4 py-3 text-slate-700 hover:text-cyan-600 hover:bg-slate-50 rounded-xl transition-all" data-cat="${catSlug}">
                    <span class="font-bold text-sm tracking-wide uppercase">${cat.name}</span>
                    <i data-lucide="chevron-down" class="w-4 h-4 transition-transform duration-200"></i>
                </button>
                <div id="mobile-items-${catSlug}" class="hidden space-y-1 mt-1 ml-4 border-l border-slate-200 pl-2">
                    <a href="${getDynamicUrl('category', catSlug, false)}" class="block px-4 py-2 text-xs font-bold text-cyan-600 hover:text-cyan-500 uppercase tracking-widest">See All ${cat.name}</a>
                    ${catItemsHtml}
                </div>
            </div>
        `;
    });

    header = header.replace(/<nav[^>]*id="desktop-nav">[\s\S]*?<\/nav>/, `<nav class="desktop-nav-container items-center gap-1" id="desktop-nav">${desktopNavHtml}</nav>`);
    header = header.replace(/<div[^>]*id="mobile-nav-items">[\s\S]*?<\/div>/, `<div class="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide" id="mobile-nav-items">${mobileNavHtml}</div>`);
    
    // Replace site config placeholders
    header = header.replace(/{{LOGO_TEXT}}/g, siteConfig.logoText);
    
    return header;
}

console.log("Reading output.css for Critical CSS inlining...");
let cssContent = fs.readFileSync('output.css', 'utf8');

// --- Fix CSS Linter Warnings in inlined CSS ---
// 0. Strip CSS comments to avoid regex issues
cssContent = cssContent.replace(/\/\*[\s\S]*?\*\//g, '');

// 1. Fix line-clamp compatibility
cssContent = cssContent.replace(/-webkit-line-clamp:\s*(\d+)/g, '-webkit-line-clamp: $1; line-clamp: $1');
// 2. Fix appearance compatibility (ensuring standard property is present)
cssContent = cssContent.replace(/(-webkit-appearance|-moz-appearance):\s*([^;! }]+)/g, (match, p1, p2) => {
    return `${p1}: ${p2}; appearance: ${p2}`;
});
// Remove any resulting duplicates like "appearance: none; appearance: none"
cssContent = cssContent.replace(/(appearance:\s*[^;! }]+);\s*appearance:\s*\1/g, '$1');

// 3. Fix "vertical-align ignored" warning in Tailwind reset
cssContent = cssContent.replace(/(canvas|audio|iframe|embed|object)[^{]*\{[^}]*display:\s*block;?[^}]*vertical-align:\s*middle;?[^}]*\}/g, (match) => {
    return match.replace(/vertical-align:\s*middle;?/g, '');
});
cssContent = minifyCSS(cssContent);

console.log("Reading header_partial.html...");
// We will generate the header dynamically for each page using generateFullHeader()

// --- 3. Build Homepage ---
console.log("Building Homepage...");
const indexTemplate = fs.readFileSync('site_template.html', 'utf8'); // Keep master template in memory
let indexHtml = indexTemplate;

// Inject Header
indexHtml = indexHtml.replace('{{HEADER}}', generateFullHeader('./', products, categories, siteConfig));

// Generate Category Options for Homepage Search
const categoryOptions = `
    <option value="All Categories">All Departments</option>
    ${categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('\n    ')}
`;
indexHtml = indexHtml.replace('{{CATEGORY_OPTIONS}}', categoryOptions);

// Generate Product Grid
const productGridHtml = products.map((p, idx) => {
    const card = renderProductCard(p, '');
    // Prioritize first 4 products on homepage for LCP/SI
    if (idx < 4) {
        return card.replace('loading="lazy"', 'fetchpriority="high"').replace('width="400" height="300"', 'width="400" height="300" fetchpriority="high"');
    }
    return card;
}).join('\n');
indexHtml = indexHtml.replace('{{PRODUCT_GRID}}', `
    <div id="product-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        ${productGridHtml}
    </div>
`);

// Generate Footer
indexHtml = indexHtml.replace('{{FOOTER}}', generateFooter(products, siteConfig, '/'));

// Generate Latest Articles
indexHtml = indexHtml.replace('{{LATEST_ARTICLES}}', generateLatestArticlesHtml(blogs));

// Inline Critical CSS
indexHtml = indexHtml.replace(/{{CRITICAL_CSS}}/g, `<style>${cssContent}</style>`);

// Preload first 2 product images for LCP
const homepagePreload = products.slice(0, 2).map(p => `<link rel="preload" href="${getImageUrl(p.image)}" as="image" fetchpriority="high">`).join('');
indexHtml = indexHtml.replace('{{PRODUCT_IMAGE_PRELOAD}}', homepagePreload);

// Global Placeholders
indexHtml = indexHtml.replace(/{{CANONICAL_URL}}/g, 'https://pvaitshop.com/');
indexHtml = replaceGlobalPlaceholders(indexHtml, siteConfig);

// Save Homepage
fs.writeFileSync('index.html', indexHtml);
console.log("Homepage built.");

// --- 3.1 Build Category Pages ---
console.log("Building Category Pages...");
cleanDirectory('category');
const uniqueCategories = [...new Set(products.map(p => p.category))];
let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

// Add Homepage to Sitemap
sitemap += '  <url>\n';
sitemap += '    <loc>https://pvaitshop.com/</loc>\n';
sitemap += '    <lastmod>' + new Date().toISOString().split('T')[0] + '</lastmod>\n';
sitemap += '    <priority>1.0</priority>\n';
sitemap += '  </url>\n';

uniqueCategories.forEach(cat => {
        const catData = categories.find(c => c.name === cat);
        if (!catData || !catData.slug) {
            console.warn(`Category "${cat}" has no slug defined in site_data.js. Skipping page generation.`);
            return;
        }
        const slug = catData.slug;
        const dir = path.join(paths.category, slug);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Find category data from site_data (now we have rich content there)
    const categoryData = categories.find(c => c.name === cat) || {};
    const richContent = categoryData.content || '';
    const catDescription = categoryData.description || `Buy verified ${cat} accounts and reviews. Secure, fast, and trusted services for ${cat} marketing.`;

    let catHtml = indexTemplate;
    // Inject Header for Category Pages
    catHtml = catHtml.replace('{{HEADER}}', generateFullHeader('../../', products, categories, siteConfig));
    
    // SEO & Hero
    const catTitle = `${cat} Accounts & Reviews | pvaitshop`;
    
    // Replace Category Options
    catHtml = catHtml.replace('{{CATEGORY_OPTIONS}}', categoryOptions);

    // Replace Hero with Category Title
    catHtml = catHtml.replace('{{HERO_TITLE}}', `<span class="text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-blue-600">${cat}</span> Services`);
    catHtml = catHtml.replace('{{HERO_SUBTITLE}}', catDescription);
    
    // Override Global SEO for Category
    catHtml = catHtml.replace(/{{SITE_TITLE}}/g, catTitle);
    catHtml = catHtml.replace(/{{META_DESCRIPTION}}/g, catDescription);

    // SEO URL Fixes
    const catUrl = getDynamicUrl('category', slug);
    catHtml = catHtml.replace(/{{CANONICAL_URL}}/g, catUrl);
    
    // Filter Products
    const catProducts = products.filter(p => p.category === cat);
    const catGrid = catProducts.map((p, idx) => {
        const card = renderProductCard(p, '../../');
        // Prioritize first 4 products for LCP/SI
        if (idx < 4) {
            return card.replace('loading="lazy"', 'fetchpriority="high"').replace('width="400" height="300"', 'width="400" height="300" fetchpriority="high"');
        }
        return card;
    }).join('\n');
    
    const contentAndGrid = `
        <div class="max-w-7xl mx-auto px-4 mb-16 prose lg:prose-xl">
            ${richContent}
        </div>
        <div class="max-w-7xl mx-auto px-4 mb-8">
            <h3 class="text-2xl font-bold text-slate-900 border-l-4 border-cyan-500 pl-4">Available Packages</h3>
        </div>
        <div id="product-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            ${catGrid}
        </div>
    `;

    catHtml = catHtml.replace('{{PRODUCT_GRID}}', contentAndGrid);
    
    // Latest Articles
    catHtml = catHtml.replace('{{LATEST_ARTICLES}}', generateLatestArticlesHtml(blogs));
    
    // Footer
    catHtml = catHtml.replace('{{FOOTER}}', generateFooter(products, siteConfig, '../../').replace(new RegExp(`href="/${paths.product}`, 'g'), `href="../../${paths.product}`).replace(/href="#"/g, 'href="../../"'));

    // CSS
    catHtml = catHtml.replace(/{{CRITICAL_CSS}}/g, `<style>${cssContent}</style>`);
    
    // Preload first 2 product images for LCP
    const catPreload = catProducts.slice(0, 2)
        .map(p => {
            const url = getImageUrl(p.image);
            return url ? `<link rel="preload" href="${url}" as="image" fetchpriority="high">` : '';
        })
        .filter(Boolean)
        .join('');
    catHtml = catHtml.replace('{{PRODUCT_IMAGE_PRELOAD}}', catPreload);

    // Global Placeholders
    catHtml = replaceGlobalPlaceholders(catHtml, siteConfig);

    fs.writeFileSync(path.join(dir, 'index.html'), minifyHTML(catHtml));

    // Sitemap
    sitemap += '  <url>\n';
    sitemap += `    <loc>${getDynamicUrl('category', slug)}</loc>\n`;
    sitemap += '    <lastmod>' + new Date().toISOString().split('T')[0] + '</lastmod>\n';
    sitemap += '    <priority>0.9</priority>\n';
    sitemap += '  </url>\n';
});

// --- 3.2 Build Blog Listing & Posts ---
console.log("Building Blog Pages...");
cleanDirectory(paths.blog);
const blogDir = paths.blog;
if (!fs.existsSync(blogDir)) fs.mkdirSync(blogDir);

// Pagination Settings
const postsPerPage = 6;
const totalPages = Math.ceil(blogs.length / postsPerPage);

// Helper: Generate Sidebar
function generateSidebar(products, blogs) {
    const popularBlogs = blogs.slice(0, 3).map(b => `
        <li class="flex gap-3 items-start">
             <div class="w-16 h-16 bg-slate-200 rounded-lg overflow-hidden shrink-0">
                <img src="${getImageUrl(b.image, '../../')}" alt="${b.title}" class="w-full h-full object-cover opacity-90 hover:opacity-100 transition" loading="lazy" decoding="async" width="64" height="64">
             </div>
             <div>
                 <a href="${getDynamicUrl('blog', b.slug, false)}" class="text-sm font-bold text-slate-900 hover:text-cyan-600 leading-tight block mb-1">${b.title}</a>
                 <span class="text-xs text-slate-500">${b.date}</span>
             </div>
        </li>
    `).join('');

    const bestSellers = products.filter(p => p.is_sale).slice(0, 3).map(p => `
        <li class="flex items-center gap-3 border-b border-slate-200 pb-3 last:border-0 last:pb-0">
             <div class="w-10 h-10 bg-gradient-to-br ${gradients[p.badge_color] || gradients.blue} rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0">
                ${p.category.substring(0,2).toUpperCase()}
             </div>
             <div>
                 <a href="${getDynamicUrl('product', p.slug, false)}" class="text-sm font-bold text-slate-900 hover:text-cyan-600 block">${p.title}</a>
                 <span class="text-xs font-bold text-cyan-600">$${p.min_price}</span>
             </div>
        </li>
    `).join('');

    return `
        <!-- Popular Guides -->
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 class="font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Popular Guides</h3>
            <ul class="space-y-4">
               ${popularBlogs}
            </ul>
        </div>

        <!-- Trusted Products -->
        <div class="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
             <h3 class="font-bold text-slate-900 mb-4 border-b border-slate-100 pb-2">Best Sellers</h3>
             <ul class="space-y-3">
                 ${bestSellers}
             </ul>
        </div>

        <!-- CTA Box -->
        <div class="bg-gradient-to-br from-cyan-600 to-blue-700 p-6 rounded-xl text-center shadow-md">
            <h3 class="font-bold text-white mb-2 text-lg">Need Verified Accounts?</h3>
            <p class="text-white/90 text-sm mb-6">Get premium, phone-verified accounts for Google, Facebook, and more instantly.</p>
            <a href="/" class="block bg-white text-blue-700 font-bold py-3 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                View All Products
            </a>
        </div>
    `;
}

// Helper: Inject CTA (Replaces [[CTA1]] and [[CTA2]])
function injectCTA(content, post) {
    const generateHTML = (text, link) => `
        <div class="cta-box my-10 bg-gradient-to-r from-slate-50 to-slate-100 border-l-4 border-cyan-500 p-6 rounded-r-xl shadow-sm">
            <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div class="text-center sm:text-left">
                    <h4 class="text-lg font-bold text-slate-900 mb-1">Looking for verified accounts?</h4>
                    <p class="text-slate-600 text-sm">${text || "Get Verified PVA Accounts Now"}</p>
                </div>
                <a href="${link || "/"}" class="shrink-0 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2.5 px-6 rounded-lg transition-all shadow-sm whitespace-nowrap">
                    Check Availability &rarr;
                </a>
            </div>
        </div>
    `;

    let newContent = content;
    let hasReplacement = false;

    if (newContent.includes('[[CTA1]]')) {
        newContent = newContent.replace('[[CTA1]]', generateHTML(post.cta_1_text, post.cta_1_link));
        hasReplacement = true;
    }

    if (newContent.includes('[[CTA2]]')) {
        newContent = newContent.replace('[[CTA2]]', generateHTML(post.cta_2_text, post.cta_2_link));
        hasReplacement = true;
    }

    // Fallback for older posts without placeholders: Insert after 2nd paragraph
    if (!hasReplacement && !newContent.includes('[[CTA')) {
         const parts = newContent.split('</p>');
         if (parts.length > 2) {
             const ctaHtml = generateHTML("Get Verified PVA Accounts Now", `/${paths.category}/accounts/`);
             const firstPart = parts.slice(0, 2).join('</p>') + '</p>';
             const restPart = parts.slice(2).join('</p>');
             return firstPart + ctaHtml + restPart;
         }
    }

    return newContent;
}

// Helper: Internal link 41 products across 5 blogs
function distributeProductsToBlog(content, products, blogIndex, totalBlogs) {
    // 1. Auto-link product titles found in text
    let processedContent = content;
    const sortedProducts = [...products].sort((a, b) => b.title.length - a.title.length);
    
    sortedProducts.forEach(product => {
        const escapedTitle = product.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Improved Regex: Avoids linking inside existing <a> tags or HTML attributes (like alt, title, src)
        // Matches the title only if it's not preceded by = " or ' (attributes) or inside <a> tags
        const regex = new RegExp(`(?<![="'>])\\b(${escapedTitle})\\b(?![^<]*>|[^<]*<\\/a>)`, 'gi');
        const url = getDynamicUrl('product', product.slug, false);
        processedContent = processedContent.replace(regex, `<a href="${url}" class="text-cyan-600 font-bold hover:underline">$1</a>`);
    });

    // 2. Append assigned subset of products at the bottom
    const productsPerBlog = Math.ceil(products.length / totalBlogs);
    const start = blogIndex * productsPerBlog;
    const end = Math.min(start + productsPerBlog, products.length);
    const assignedProducts = products.slice(start, end);
    
    if (assignedProducts.length > 0) {
        let productsHtml = `
            <div class="mt-16 p-8 bg-white rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div class="absolute top-0 right-0 w-32 h-32 bg-cyan-100/50 rounded-full blur-3xl"></div>
                <h3 class="text-2xl font-black text-slate-900 mb-8 flex items-center gap-3">
                    <span class="w-8 h-8 rounded-lg bg-cyan-100 flex items-center justify-center shadow-sm">
                        <i data-lucide="shopping-bag" class="w-4 h-4 text-cyan-600"></i>
                    </span>
                    Our <span class="text-cyan-600">Featured Services</span>
                </h3>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        `;
        
        assignedProducts.forEach(p => {
            const url = getDynamicUrl('product', p.slug, false);
            productsHtml += `
                <a href="${url}" class="flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all border border-slate-100 group hover:border-cyan-300">
                    <div class="w-10 h-10 rounded-full bg-cyan-100 flex items-center justify-center text-cyan-600 group-hover:bg-cyan-600 group-hover:text-white transition-all duration-300">
                        <i data-lucide="star" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <p class="text-sm font-bold text-slate-900 group-hover:text-cyan-600 transition-colors leading-tight">${p.title}</p>
                        <p class="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-semibold">Available Now</p>
                    </div>
                </a>
            `;
        });
        
        productsHtml += `
                </div>
                <div class="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p class="text-slate-500 text-sm italic">Trusted by 5,000+ happy customers worldwide.</p>
                    <a href="/" class="group px-6 py-2.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-sm transition-all flex items-center gap-2 shadow-sm">
                        Explore All 41 Services <i data-lucide="arrow-right" class="w-4 h-4 group-hover:translate-x-1 transition-transform"></i>
                    </a>
                </div>
            </div>
        `;
        processedContent += productsHtml;
    }
    
    return processedContent;
}

// Build Pagination Pages
for (let i = 1; i <= totalPages; i++) {
    const start = (i - 1) * postsPerPage;
    const end = start + postsPerPage;
    const pageBlogs = blogs.slice(start, end);
    
    // Create Page Directory: /blog/page/2/ etc.
    let pageDir = blogDir;
    let pageRelPath = '../'; // Default for /blog/index.html
    
    if (i > 1) {
        pageDir = path.join(blogDir, 'page', i.toString());
        if (!fs.existsSync(pageDir)) fs.mkdirSync(pageDir, { recursive: true });
        pageRelPath = '../../../'; // For /blog/page/2/index.html
    }

    let blogListHtml = indexTemplate;
    blogListHtml = blogListHtml.replace('{{HEADER}}', generateFullHeader(pageRelPath, products, categories, siteConfig));
    
    // Replace Category Options
    blogListHtml = blogListHtml.replace('{{CATEGORY_OPTIONS}}', categoryOptions);

    const pageTitleSuffix = i > 1 ? ` - Page ${i}` : '';
    const blogTitle = `pvaitshop Blog – Insights & Digital Strategy${pageTitleSuffix}`;
    const blogDesc = 'Expert guides, industry updates, and actionable strategies to help you navigate account management and boost your online credibility.';

    // Enhanced Hero for Blog
    blogListHtml = blogListHtml.replace('{{HERO_TITLE}}', `
        <span class="block text-cyan-600 text-lg font-bold tracking-widest uppercase mb-4">Insights & Strategy</span>
        <span class="text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-blue-600 drop-shadow-sm">Master the Digital Landscape</span>${pageTitleSuffix}
    `);
    blogListHtml = blogListHtml.replace('{{HERO_SUBTITLE}}', blogDesc);
    
    // Override Global SEO for Blog
    blogListHtml = blogListHtml.replace(/{{SITE_TITLE}}/g, blogTitle);
    blogListHtml = blogListHtml.replace(/{{META_DESCRIPTION}}/g, blogDesc);

    // SEO URL Fixes
    const canonicalUrl = i === 1 ? getDynamicUrl('blog') : `${getDynamicUrl('blog')}page/${i}/`;
    blogListHtml = blogListHtml.replace(/{{CANONICAL_URL}}/g, canonicalUrl);
    
    // Redesigned Eye-Catching Grid Layout
    const blogGrid = pageBlogs.map((b, idx) => `
        <article class="group relative flex flex-col bg-white rounded-3xl border border-slate-200 overflow-hidden transition-all duration-500 hover:border-cyan-300 hover:shadow-md hover:-translate-y-2 h-full">
            <a href="${getDynamicUrl('blog', b.slug).replace(baseUrl, '/')}" class="h-64 overflow-hidden relative block">
                <img src="${getImageUrl(b.image, pageRelPath) || ''}" alt="${b.title}" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" ${i === 1 && idx === 0 ? 'fetchpriority="high" ' : ''}loading="lazy" decoding="async" width="600" height="400">
                <div class="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-80"></div>
                
                <!-- Floating Date Badge -->
                <div class="absolute top-4 left-4 bg-white/90 backdrop-blur-md border border-slate-200 px-3 py-1.5 rounded-full text-xs font-bold text-slate-900 flex items-center gap-2 shadow-sm">
                    <i data-lucide="calendar" class="w-3 h-3 text-cyan-600"></i> ${b.date}
                </div>
            </a>
            
            <div class="p-8 flex-1 flex flex-col relative">
                <!-- Decorative Glow -->
                <div class="absolute top-0 right-0 -mt-10 -mr-10 w-32 h-32 bg-cyan-100/50 rounded-full blur-3xl group-hover:bg-cyan-200/50 transition-all"></div>

                <div class="mb-4">
                    <span class="text-xs font-bold text-cyan-700 tracking-widest uppercase border border-cyan-200 bg-cyan-50 px-2 py-1 rounded">Article</span>
                </div>

                <h3 class="text-2xl font-bold text-slate-900 mb-4 leading-tight group-hover:text-cyan-600 transition-all">
                    <a href="${getDynamicUrl('blog', b.slug).replace(baseUrl, '/')}">
                        <span class="absolute inset-0"></span>
                        ${b.title}
                    </a>
                </h3>
                
                <p class="text-slate-600 text-sm mb-8 line-clamp-3 leading-relaxed flex-1 group-hover:text-slate-700 transition-colors">${b.excerpt}</p>
                
                <div class="flex items-center justify-between mt-auto pt-6 border-t border-slate-100 group-hover:border-cyan-100 transition-colors">
                    <span class="text-sm font-bold text-slate-900 group-hover:text-cyan-600 transition-colors">Read Article</span>
                    <div class="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-cyan-600 group-hover:text-white transition-all duration-300 group-hover:scale-110">
                        <i data-lucide="arrow-right" class="w-5 h-5"></i>
                    </div>
                </div>
            </div>
        </article>
    `).join('\n');

    // Pagination Controls
    let paginationHtml = '<div class="flex justify-center items-center gap-2 mt-12">';
    if (i > 1) {
        const prevLink = i === 2 ? `/${paths.blog}/` : `/${paths.blog}/page/${i-1}/`;
        paginationHtml += `<a href="${prevLink}" class="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-cyan-600 hover:text-white transition font-bold text-sm">Previous</a>`;
    }
    for (let p = 1; p <= totalPages; p++) {
        const activeClass = p === i ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200';
        const link = p === 1 ? `/${paths.blog}/` : `/${paths.blog}/page/${p}/`;
        paginationHtml += `<a href="${link}" class="w-10 h-10 flex items-center justify-center rounded-lg ${activeClass} font-bold text-sm transition">${p}</a>`;
    }
    if (i < totalPages) {
        paginationHtml += `<a href="/${paths.blog}/page/${i+1}/" class="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 hover:bg-cyan-600 hover:text-white transition font-bold text-sm">Next</a>`;
    }
    paginationHtml += '</div>';

    blogListHtml = blogListHtml.replace('{{PRODUCT_GRID}}', `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            ${blogGrid}
        </div>
        ${paginationHtml}
    `);
    blogListHtml = blogListHtml.replace('{{LATEST_ARTICLES}}', ''); 
    blogListHtml = blogListHtml.replace('{{PRODUCT_IMAGE_PRELOAD}}', '');

    // Footer & Links
    blogListHtml = blogListHtml.replace('{{FOOTER}}', generateFooter(products, siteConfig, pageRelPath));
    blogListHtml = blogListHtml.replace(/{{CRITICAL_CSS}}/g, `<style>${cssContent}</style>`);
    
    // Global Placeholders
    blogListHtml = replaceGlobalPlaceholders(blogListHtml, siteConfig);

    fs.writeFileSync(path.join(pageDir, 'index.html'), minifyHTML(blogListHtml));
}

// Sitemap Entry for Blog
sitemap += '  <url>\n';
sitemap += `    <loc>${getDynamicUrl('blog')}</loc>\n`;
sitemap += '    <lastmod>' + new Date().toISOString().split('T')[0] + '</lastmod>\n';
sitemap += '    <priority>0.8</priority>\n';
sitemap += '  </url>\n';

// Single Blog Posts
blogs.forEach((post, index) => {
    const dir = path.join(paths.blog, post.slug);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const sidebarHtml = generateSidebar(products, blogs);
    let contentWithCta = injectCTA(post.content, post);
    
    // Internal link products (distribute 41 products across 5 blogs)
    contentWithCta = distributeProductsToBlog(contentWithCta, products, index, blogs.length);
    
    const relatedHtml = generateRelatedArticlesHtml({ id: -1, category: 'General' }, blogs.filter(b => b.id !== post.id)); // Fallback related
    const blogMetaDescription = post.meta_description || post.excerpt || '';
    const blogImageUrl = post.image ? getImageUrl(post.image, '../../') : '';
    const blogImageAlt = post.image_alt || post.title;
    const blogKeywords = [post.focus_keyword].concat(post.lsi_keywords || []).filter(Boolean).join(', ');
    const articleWordCount = contentWithCta.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
    const articleSchema = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: post.title,
        description: blogMetaDescription,
        mainEntityOfPage: getDynamicUrl('blog', post.slug),
        datePublished: post.published_at || new Date().toISOString().split('T')[0],
        dateModified: post.updated_at || post.published_at || new Date().toISOString().split('T')[0],
        author: {
            '@type': 'Organization',
            name: post.author || siteConfig.siteTitle
        },
        publisher: {
            '@type': 'Organization',
            name: siteConfig.siteTitle,
            logo: {
                '@type': 'ImageObject',
                url: new URL(siteConfig.logoUrl || '/favicon.png', baseUrl).toString()
            }
        },
        image: blogImageUrl ? [blogImageUrl] : [],
        articleSection: 'Blog',
        keywords: blogKeywords,
        wordCount: articleWordCount,
        inLanguage: 'en'
    };

    const blogPageHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${post.title} - pvaitshop</title>
    <meta name="description" content="${blogMetaDescription}">
    <meta name="keywords" content="${blogKeywords}">
    <link rel="canonical" href="${getDynamicUrl('blog', post.slug)}" />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="${post.title} - pvaitshop">
    <meta property="og:description" content="${blogMetaDescription}">
    <meta property="og:url" content="${getDynamicUrl('blog', post.slug)}">
    <meta property="og:type" content="article">
    <meta property="article:published_time" content="${post.published_at || new Date().toISOString().split('T')[0]}">
    <meta property="article:modified_time" content="${post.updated_at || post.published_at || new Date().toISOString().split('T')[0]}">
    ${blogImageUrl ? `<meta property="og:image" content="${blogImageUrl}">` : ''}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${post.title} - pvaitshop">
    <meta name="twitter:description" content="${blogMetaDescription}">
    ${blogImageUrl ? `<meta name="twitter:image" content="${blogImageUrl}">` : ''}
    <script type="application/ld+json">${JSON.stringify(articleSchema)}</script>
    <style>${cssContent}</style>
    <style>
        /* Robust Navigation Visibility */
        .desktop-nav-container { display: none !important; }
        .mobile-menu-btn-container { display: block !important; }
        .blog-content > * + * { margin-top: 1.25rem; }
        .blog-content h2 { margin-top: 3rem; margin-bottom: 1rem; line-height: 1.2; }
        .blog-content h3 { margin-top: 2rem; margin-bottom: 0.75rem; line-height: 1.3; }
        .blog-content h4 { margin-top: 1.5rem; margin-bottom: 0.5rem; line-height: 1.35; }
        .blog-content p { margin-top: 0; margin-bottom: 1.1rem; line-height: 1.9; }
        .blog-content ul,
        .blog-content ol { margin-top: 1.25rem; margin-bottom: 1.25rem; padding-left: 1.25rem; }
        .blog-content li + li { margin-top: 0.5rem; }
        .blog-content table { margin-top: 2rem; margin-bottom: 2rem; }
        .blog-content blockquote { margin-top: 1.75rem; margin-bottom: 1.75rem; }
        .blog-content .cta-box { margin-top: 2.5rem; margin-bottom: 2.5rem; }

        @media (min-width: 768px) {
            .desktop-nav-container { display: flex !important; }
            .mobile-menu-btn-container { display: none !important; }
            .blog-content > * + * { margin-top: 1.5rem; }
            .blog-content h2 { margin-top: 3.5rem; }
            .blog-content h3 { margin-top: 2.25rem; }
        }
    </style>
    <script src="https://unpkg.com/lucide@latest" defer></script>
</head>
<body class="bg-slate-50 text-slate-700 font-sans antialiased">
    ${generateFullHeader('../../', products, categories, siteConfig)}

    <!-- Header Spacing -->
    <div class="h-24"></div>

    <main class="max-w-7xl mx-auto px-4 py-8">
        <!-- Breadcrumb -->
        <nav class="flex text-sm text-slate-500 mb-8 overflow-x-auto whitespace-nowrap">
            <a href="/" class="hover:text-cyan-600">Home</a>
            <span class="mx-2">/</span>
            <a href="/${paths.blog}/" class="hover:text-cyan-600">Blog</a>
            <span class="mx-2">/</span>
            <span class="text-cyan-600 truncate">${post.title}</span>
        </nav>

        <div class="flex flex-col lg:flex-row gap-12">
            <!-- Main Content (70%) -->
            <article class="lg:w-[70%]">
                <header class="mb-8">
                    <span class="text-cyan-600 font-bold tracking-wider text-sm uppercase mb-3 block">${post.date}</span>
                    <h1 class="text-3xl md:text-4xl lg:text-5xl font-extrabold text-slate-900 mb-6 leading-tight">${post.title}</h1>
                    <p class="text-xl text-slate-600 leading-relaxed border-l-4 border-cyan-500 pl-4 italic">
                        ${post.excerpt}
                    </p>
                </header>

                ${post.image ? `<img src="${blogImageUrl}" alt="${blogImageAlt}" class="w-full rounded-2xl mb-10 shadow-md border border-slate-200" fetchpriority="high" loading="lazy" decoding="async" width="1200" height="630">` : ''}

                <div class="blog-content prose lg:prose-xl max-w-none prose-headings:text-slate-900 prose-a:text-cyan-600 prose-a:no-underline hover:prose-a:underline prose-strong:text-slate-900">
                    ${contentWithCta}
                </div>

                <!-- Trust Section / Related -->
                ${relatedHtml}

                <div class="mt-12 pt-8 border-t border-slate-200 flex justify-between items-center">
                    <a href="/${paths.blog}/" class="font-bold text-slate-500 hover:text-slate-900 flex items-center gap-2">
                        <i data-lucide="arrow-left" class="w-4 h-4"></i> Back to Blog
                    </a>
                </div>
            </article>

            <!-- Sidebar (30%) -->
            <aside class="lg:w-[30%] space-y-8">
                ${sidebarHtml}
            </aside>
        </div>
    </main>

    <footer class="bg-white border-t border-slate-200 py-6 mt-12">
        ${generateFooter(products, siteConfig, '../../').replace(new RegExp(`href="/${paths.product}`, 'g'), `href="../../${paths.product}`).replace(/href="#"/g, 'href="../../"')}
    </footer>

    <!-- Scripts -->
    <script src="../../site_data.js?v=${assetVersion}" defer></script>
    <script src="../../ui.js?v=${assetVersion}" defer></script>
</body>
</html>`;

    let finalBlogPageHtml = blogPageHtml;
    
    // Global Placeholders
    finalBlogPageHtml = replaceGlobalPlaceholders(finalBlogPageHtml, siteConfig);

    fs.writeFileSync(path.join(dir, 'index.html'), minifyHTML(finalBlogPageHtml));

    sitemap += '  <url>\n';
    sitemap += `    <loc>${getDynamicUrl('blog', post.slug)}</loc>\n`;
    sitemap += '    <lastmod>' + new Date().toISOString().split('T')[0] + '</lastmod>\n';
    sitemap += '    <priority>0.7</priority>\n';
    sitemap += '  </url>\n';
});

console.log("Building Product Pages...");
cleanDirectory(paths.product);
const productTemplate = fs.readFileSync('product_template.html', 'utf8');

const productCssContent = cssContent;

products.forEach(product => {
    if (!product.slug) return;

    // --- Sitemap ---
    sitemap += '  <url>\n';
    sitemap += `    <loc>${getDynamicUrl('product', product.slug)}</loc>\n`;
    sitemap += '    <lastmod>' + new Date().toISOString().split('T')[0] + '</lastmod>\n';
    sitemap += '    <priority>0.8</priority>\n';
    sitemap += '  </url>\n';

    // --- Prepare Data ---
    const slug = product.slug.trim().replace(/^\/+|\/+$/g, ''); 
    const solidColor = computeProductColor(product);
    const featuresList = product.features.map(f => 
        `<li class="flex items-start gap-2 text-slate-300 text-sm"><i data-lucide="check-circle-2" class="w-4 h-4 text-cyan-400 mt-0.5 shrink-0"></i> ${f}</li>`
    ).join('');
    const bottomFeaturesList = product.features.map(f => 
        `<li class="flex items-start gap-2 text-slate-400 text-sm"><i data-lucide="check" class="w-4 h-4 text-cyan-500 mt-0.5 shrink-0"></i> ${f}</li>`
    ).join('');
    
    let pricingOptions = '<option selected disabled>Choose an option</option>';
    if (product.pricing) {
        pricingOptions += product.pricing.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // Related Products
    let related = [];
    if (product.related_ids && product.related_ids.length > 0) {
        related = products.filter(p => product.related_ids.includes(p.id));
    }
    if (related.length === 0) {
        related = products.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);
    }
    const relatedHtml = related.map(p => {
        const relColor = computeProductColor(p);
        const relSlug = p.slug.replace(/^\/+|\/+$/g, '');
        const relUrl = getDynamicUrl('product', relSlug, false);
        const relImgUrl = getImageUrl(p.image, '../../');
        const relImgHtml = relImgUrl 
            ? `<img src="${relImgUrl}" alt="${p.image_title || p.title}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy" decoding="async" width="400" height="300">`
            : '';
        const relOverlayClass = relImgUrl ? '' : 'bg-black/0 group-hover:bg-black/0';
        const relOverlayLayerHtml = relImgUrl ? '' : `<div class="absolute inset-0 ${relOverlayClass} transition-colors duration-300"></div>`;
        const relOverlayTextHtml = relImgUrl ? '' : `
                    <div class="absolute top-2 left-2 bg-red-500/90 backdrop-blur-md border border-white/10 text-xs font-bold px-3 py-1 rounded flex gap-1 z-10">
                        <span class="text-yellow-300 text-sm">Sale!</span> pvaitshop
                    </div>
                    <h3 class="font-bold text-lg leading-tight mb-2 px-2 drop-shadow-md z-10 relative text-white">${p.display_title || p.title.replace(/^Buy\s+/i, '')}</h3>
                    <div class="bg-white/10 hover:bg-white/20 text-xs font-bold px-4 py-1.5 rounded-full cursor-pointer transition-colors border border-white/20 z-10 text-white">GET STARTED</div>
        `;

        return `
            <div class="card-glow bg-white rounded-xl border border-slate-200 overflow-hidden transition-all duration-300 group hover:-translate-y-2 shadow-sm hover:shadow-md" style="content-visibility: auto; contain-intrinsic-size: 0 350px;">
                <div role="img" aria-label="${p.image_title || p.title}" class="p-4 h-44 relative flex flex-col items-center justify-center text-center text-white group-hover:scale-105 transition-transform duration-500" style="background-color: ${relColor};">
                    ${relImgHtml}
                    ${relOverlayLayerHtml}
                    ${relOverlayTextHtml}
                </div>
                <div class="p-4">
                    <p class="text-[10px] font-bold text-cyan-600 uppercase tracking-wider mb-1">${p.category}</p>
                    <a href="${relUrl}" class="font-bold text-slate-900 text-sm mb-2 block hover:text-cyan-600 transition-colors truncate">${p.title}</a>
                    <div class="flex gap-0.5 mb-3">
                        ${renderStars(5, "w-3 h-3")} 
                    </div>
                    <div class="text-slate-900 text-sm mb-4 font-extrabold">$${p.min_price.toFixed(2)} - $${p.max_price.toFixed(2)}</div>
                    <a href="${relUrl}" class="block w-full bg-slate-50 hover:bg-cyan-600 text-slate-700 hover:text-white text-center py-3.5 rounded-lg text-sm font-bold transition-all border border-slate-200 hover:border-cyan-500">View Details</a>
                </div>
            </div>`;
    }).join('');

    // Reviews
    const pReviews = reviewsData ? reviewsData.filter(r => r.productId === product.id) : [];
    let reviewsHtml = '';
    if (pReviews.length === 0) {
        reviewsHtml = '<div class="text-center py-10 bg-slate-50 rounded-xl border border-slate-200"><p class="text-slate-500 mb-2">No reviews yet.</p><p class="text-sm text-slate-600">Be the first to write a review!</p></div>';
    } else {
        reviewsHtml = pReviews.map(r => `
            <div class="bg-white p-6 rounded-2xl border border-slate-200 hover:border-cyan-300 transition-all duration-300 hover:shadow-lg group shadow-sm">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white font-black text-lg border-2 border-white shadow-sm group-hover:scale-110 transition-transform duration-300">
                            ${r.avatar || (r.user ? r.user.charAt(0).toUpperCase() : 'U')}
                        </div>
                        <div>
                            <h4 class="font-bold text-slate-900 text-base mb-0.5">${r.user}</h4>
                            <div class="flex items-center gap-2 text-xs font-medium text-slate-500">
                                <span>${r.date}</span>
                                ${r.verified !== false ? `
                                <span class="text-cyan-700 flex items-center gap-1 bg-cyan-50 px-2 py-0.5 rounded-full text-[10px] border border-cyan-200">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-badge-check w-3 h-3"><path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.78 4.78 4 4 0 0 1-6.74 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.74Z"/><path d="m9 12 2 2 4-4"/></svg> Verified Buyer
                                </span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="flex gap-0.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                        ${renderStars(r.rating, "w-3 h-3")}
                    </div>
                </div>
                ${r.title ? `<h5 class="text-slate-900 font-bold text-base mb-2 group-hover:text-cyan-600 transition-colors">${r.title}</h5>` : ''}
                <p class="text-slate-600 text-sm leading-relaxed opacity-90 group-hover:opacity-100 transition-opacity">${r.text}</p>
            </div>
        `).join('');
    }

    // JSON-LD
    const jsonLd = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": product.title,
        "description": product.meta_description || product.short_description,
        "sku": String(product.id),
        "brand": { "@type": "Brand", "name": "pvaitshop" },
        "offers": {
            "@type": "AggregateOffer",
            "priceCurrency": "USD",
            "lowPrice": product.min_price,
            "highPrice": product.max_price,
            "offerCount": product.pricing ? product.pricing.length : 1,
            "availability": "https://schema.org/InStock"
        },
        "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "5.0",
            "reviewCount": pReviews.length > 0 ? pReviews.length : 1
        }
    };

    // --- Replace Placeholders ---
    let html = productTemplate;
    // Inject Header for Product Pages
    html = html.replace('{{HEADER}}', generateFullHeader('../../', products, categories, siteConfig));

    // SEO
    const seoTitle = `${product.title} – Verified & Fast | pvaitshop`;
    let seoDesc = product.meta_description || product.short_description || `Buy ${product.title} instantly.`;
    
    // Ensure Description Length (120-160 chars)
    if (seoDesc.length < 120) {
        seoDesc += " Get high-quality verified accounts instantly at pvaitshop. Secure, fast, and reliable service with 24/7 support.";
    }
    if (seoDesc.length > 160) {
        seoDesc = seoDesc.substring(0, 157) + "...";
    }

    html = html.replace(/{{SEO_TITLE}}/g, seoTitle);
    html = html.replace(/{{SEO_DESCRIPTION}}/g, seoDesc);
    html = html.replace('{{SEO_TAGS}}', `
        <link rel="canonical" href="${getDynamicUrl('product', slug)}" />
        <meta name="robots" content="index, follow" />
        <meta property="og:title" content="${seoTitle}" />
        <meta property="og:description" content="${seoDesc}" />
        <meta property="og:url" content="${getDynamicUrl('product', slug)}" />
        <meta property="og:type" content="product" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="${seoTitle}" />
        <meta name="twitter:description" content="${seoDesc}" />
    `);
    html = html.replace('{{JSON_LD}}', `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);

    // Content
    const fullImgUrl = getImageUrl(product.image, '../../');
    const preloadHtml = fullImgUrl ? `<link rel="preload" href="${fullImgUrl}" as="image" fetchpriority="high">` : '';
    html = html.replace('{{PRODUCT_IMAGE_PRELOAD}}', preloadHtml);

    const productImageHtml = fullImgUrl 
        ? `<img src="${fullImgUrl}" alt="${product.image_title || product.title}" class="absolute inset-0 w-full h-full object-cover z-0" fetchpriority="high" loading="lazy" decoding="async" width="800" height="600">`
        : '';
    html = html.replace('{{PRODUCT_IMAGE_HTML}}', productImageHtml);
    html = html.replace('{{PRODUCT_BG_CLASS}}', fullImgUrl ? 'hidden' : '');
    html = html.replace(/{{SOLID_COLOR}}/g, solidColor);
    html = html.replace(/rgb\(1,\s*2,\s*3\)/g, solidColor);
    html = html.replace('{{HERO_STARS}}', renderStars(5, "w-5 h-5"));
    
    // Category & Slug
    const catData = categories.find(c => c.name === product.category);
    const catSlug = catData ? catData.slug : product.category.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, '');
    html = html.replace(/{{CATEGORY}}/g, product.category);
    html = html.replace(/{{CATEGORY_SLUG}}/g, catSlug);
    
    html = html.replace(/{{PRODUCT_TITLE}}/g, product.title);
    html = html.replace(/{{DISPLAY_TITLE}}/g, product.display_title || product.title.replace(/^Buy\s+/i, ''));
    html = html.replace(/{{IMAGE_TITLE}}/g, product.image_title || product.title);
    html = html.replace('{{DETAIL_STARS}}', renderStars(5, "w-4 h-4"));
    html = html.replace('{{REVIEW_COUNT_TEXT}}', `(${pReviews.length} Customer Reviews)`);
    html = html.replace(/{{REVIEW_COUNT}}/g, String(pReviews.length));
    html = html.replace('{{PRICE_TEXT}}', `$${product.min_price.toFixed(2)} - $${product.max_price.toFixed(2)}`);
    html = html.replace(/{{SHORT_DESC}}/g, product.short_description || product.description || '');
    html = html.replace('{{FEATURES_LIST}}', featuresList);
    html = html.replace('{{PRICING_OPTIONS}}', pricingOptions);
    html = html.replace('{{LONG_DESC}}', generateRichDescription(product));
    html = html.replace('{{BOTTOM_FEATURES_LIST}}', bottomFeaturesList);
    html = html.replace('{{SUMMARY_STARS}}', renderStars(5, "w-5 h-5"));
    html = html.replace('{{REVIEWS_LIST}}', reviewsHtml);
    html = html.replace('{{RELATED_PRODUCTS}}', relatedHtml);
    html = html.replace('{{RELATED_ARTICLES}}', generateRelatedArticlesHtml(product, blogs));
    html = html.replace('{{SOCIAL_SHARE}}', generateSocialShare(product));
    
    // Inline Critical CSS
    html = html.replace(/{{CRITICAL_CSS}}/g, `<style>${productCssContent}</style>`);

    html = html.replace('{{FOOTER}}', generateFooter(products, siteConfig, '../../'));

    html = html.replace('{{SITE_CONFIG_JS}}', ''); // Remove placeholder, siteConfig is in site_data.js

    // Global Placeholders (Must be after Footer to catch placeholders in it)
    html = replaceGlobalPlaceholders(html, siteConfig);

    // Write File
    const dir = path.join(paths.product, slug);
    if (!fs.existsSync(dir)){
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, 'index.html'), minifyHTML(html));
});
console.log("Product pages built.");

// --- 5. Generate Robots & Sitemap ---
console.log("Building Visual Sitemap Page...");
let sitemapHtmlContent = `
    <div class="max-w-7xl mx-auto px-4 py-12">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <!-- Main Pages -->
            <div class="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm hover:border-cyan-300 hover:shadow-md transition-all group">
                <h2 class="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                    <div class="p-2 bg-cyan-50 rounded-lg group-hover:bg-cyan-100 transition-colors">
                        <i data-lucide="home" class="w-6 h-6 text-cyan-600"></i>
                    </div>
                    Main Pages
                </h2>
                <div class="flex flex-col gap-4">
                    <a href="/" class="text-slate-600 hover:text-cyan-600 transition-colors flex items-center gap-2 group/link">
                        <i data-lucide="chevron-right" class="w-4 h-4 text-slate-400 group-hover/link:text-cyan-600 transition-colors"></i> 
                        <span class="font-medium">Home Page</span>
                    </a>
                    <a href="/${paths.blog}/" class="text-slate-600 hover:text-cyan-600 transition-colors flex items-center gap-2 group/link">
                        <i data-lucide="chevron-right" class="w-4 h-4 text-slate-400 group-hover/link:text-cyan-600 transition-colors"></i> 
                        <span class="font-medium">Our Blog</span>
                    </a>
                </div>
            </div>

            <!-- Categories -->
            <div class="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm hover:border-cyan-300 hover:shadow-md transition-all group">
                <h2 class="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                    <div class="p-2 bg-purple-50 rounded-lg group-hover:bg-purple-100 transition-colors">
                        <i data-lucide="layers" class="w-6 h-6 text-purple-600"></i>
                    </div>
                    Categories
                </h2>
                <div class="flex flex-col gap-4">
                    ${categories.map(cat => {
                        if (!cat.slug) return '';
                        const slug = cat.slug;
                        return `
                        <a href="/${paths.category}/${slug}/" class="text-slate-600 hover:text-cyan-600 transition-colors flex items-center gap-2 group/link">
                            <i data-lucide="chevron-right" class="w-4 h-4 text-slate-400 group-hover/link:text-purple-600 transition-colors"></i> 
                            <span class="font-medium">${cat.name}</span>
                        </a>`;
                    }).join('')}
                </div>
            </div>

            <!-- Blog Posts -->
            <div class="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm hover:border-cyan-300 hover:shadow-md transition-all group">
                <h2 class="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                    <div class="p-2 bg-pink-50 rounded-lg group-hover:bg-pink-100 transition-colors">
                        <i data-lucide="book-open" class="w-6 h-6 text-pink-600"></i>
                    </div>
                    Blog Articles
                </h2>
                <div class="flex flex-col gap-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                    ${blogs.map(post => `
                        <a href="/${paths.blog}/${post.slug}/" class="text-slate-600 hover:text-cyan-600 transition-colors flex items-center gap-2 group/link">
                            <i data-lucide="chevron-right" class="w-4 h-4 text-slate-400 group-hover/link:text-pink-600 transition-colors"></i> 
                            <span class="text-sm font-medium line-clamp-1">${post.title}</span>
                        </a>
                    `).join('')}
                </div>
            </div>

            <!-- Product Pages Grouped by Category -->
            ${categories.map(cat => {
                const catProducts = products.filter(p => p.category === cat.name);
                if (catProducts.length === 0) return '';
                const seed = getProductSeed({slug: cat.name});
                const hue = (seed * 137.508) % 360;
                const color = `hsl(${hue}, 70%, 40%)`;
                
                return `
                    <div class="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm hover:border-cyan-300 hover:shadow-md transition-all group">
                        <h2 class="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
                            <div class="p-2 rounded-lg group-hover:opacity-80 transition-opacity" style="background-color: ${color}20">
                                <i data-lucide="shopping-cart" class="w-6 h-6" style="color: ${color}"></i>
                            </div>
                            ${cat.name}
                        </h2>
                        <div class="flex flex-col gap-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
                              ${catProducts.map(p => `
                                  <a href="/${paths.product}/${p.slug}/" class="text-slate-600 hover:text-cyan-600 transition-colors flex items-center gap-2 group/link">
                                      <i data-lucide="chevron-right" class="w-4 h-4 text-slate-400 transition-colors"></i>
                                      <span class="text-sm font-medium line-clamp-1">${p.display_title || p.title}</span>
                                  </a>
                              `).join('')}
                          </div>
                    </div>
                `;
            }).join('')}
        </div>
    </div>
`;

let sitemapPageHtml = indexTemplate;
sitemapPageHtml = sitemapPageHtml.replace('{{HEADER}}', generateFullHeader('./', products, categories, siteConfig));
sitemapPageHtml = sitemapPageHtml.replace('{{HERO_TITLE}}', 'Site <span class="text-transparent bg-clip-text bg-gradient-to-r from-cyan-600 to-blue-600">Map</span>');
sitemapPageHtml = sitemapPageHtml.replace('{{HERO_SUBTITLE}}', 'Explore our complete directory of high-quality PVA accounts and digital services.');
sitemapPageHtml = sitemapPageHtml.replace('{{PRODUCT_IMAGE_PRELOAD}}', '');
sitemapPageHtml = sitemapPageHtml.replace('{{PRODUCT_GRID}}', sitemapHtmlContent);
sitemapPageHtml = sitemapPageHtml.replace('{{LATEST_ARTICLES}}', ''); // Clear latest articles section
sitemapPageHtml = sitemapPageHtml.replace('{{FOOTER}}', generateFooter(products, siteConfig, './'));
sitemapPageHtml = sitemapPageHtml.replace(/{{CRITICAL_CSS}}/g, `<style>${cssContent}</style>`);
sitemapPageHtml = sitemapPageHtml.replace(/pvaitshop – Buy Verified Accounts & Reviews Instantly/g, 'Sitemap | pvaitshop');

// Important: Replace all global placeholders in sitemap page too
sitemapPageHtml = replaceGlobalPlaceholders(sitemapPageHtml, siteConfig);

fs.writeFileSync('sitemap.html', minifyHTML(sitemapPageHtml));

sitemap += '  <url>\n';
sitemap += `    <loc>${getDynamicUrl('home')}sitemap.html</loc>\n`;
sitemap += '    <lastmod>' + new Date().toISOString().split('T')[0] + '</lastmod>\n';
sitemap += '    <priority>0.5</priority>\n';
sitemap += '  </url>\n';
sitemap += '</urlset>';
fs.writeFileSync('sitemap.xml', sitemap);
console.log("sitemap.xml and sitemap.html created.");

const robots = `User-agent: *
Allow: /
Sitemap: ${getDynamicUrl('home')}${paths.sitemap}`;
fs.writeFileSync('robots.txt', robots);
console.log("robots.txt created.");



console.log("Build Finished Successfully!");
