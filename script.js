document.addEventListener('DOMContentLoaded', () => {
    // --- Global variable to store the pristine HTML of the content area ---
    let originalContentHTML = '';

    // --- Element References (cached for performance) ---
    const tocToggleButton = document.getElementById('toc-toggle-button');
    const tocSidebar = document.getElementById('toc-sidebar');
    const body = document.body;
    const contentElement = document.getElementById('content');
    const scrollToTopButton = document.getElementById('scroll-to-top');
    const searchBox = document.getElementById('search-box');
    const searchActFilter = document.getElementById('search-act-filter');
    const themeToggleBtn = document.getElementById('theme-toggle');
    const fontDecreaseBtn = document.getElementById('font-decrease');
    const fontIncreaseBtn = document.getElementById('font-increase');
    const searchStatusSpan = document.getElementById('search-status');
    const prevMatchBtn = document.getElementById('prev-match');
    const nextMatchBtn = document.getElementById('next-match');
    const currentActStatusSpan = document.getElementById('current-act-status');
    const tocList = document.getElementById('toc-list');
    const collapseAllSectionsBtn = document.getElementById('collapse-all-sections-btn');

    // --- State Variables ---
    let matches = [];
    let currentMatchIndex = -1;
    let tocLinks = [];
    let contentHeadings = [];
    let currentFontSize = parseInt(localStorage.getItem('fontSize')) || 16;
    let scrollTimeout;
    window.lastSearchedTerm = '';
    let isInitialScrollSpyUpdate = true;
    let scrollSpyOverrideId = null; // Fix for TOC click race condition

    // --- Constants ---
    const DEFAULT_FONT_SIZE = 16;
    const FONT_SIZE_STEP = 1;
    const MIN_FONT_SIZE = 10;
    const MAX_FONT_SIZE = 24;
    const SCROLL_SPY_OFFSET = 180;
    const MOBILE_BREAKPOINT = 900; // Consistent breakpoint for responsive behavior

    // --- UTILITY FUNCTIONS ---
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function generateId(text, basePrefix = 'toc') {
        let idText = 'default-id-text';
        if (typeof text === 'string' || typeof text === 'number') {
            idText = text.toString().trim().toLowerCase()
                .replace(/\s+/g, '-')
                .replace(/[^\w-]+/g, '')
                .replace(/-+/g, '-');
            if (!idText) {
                idText = 'generated-empty';
            }
        }
        return `${basePrefix}-${idText}`;
    }

    function getAbsoluteTop(element) {
        let absoluteTop = 0;
        while(element) {
            absoluteTop += element.offsetTop;
            element = element.offsetParent;
        }
        return absoluteTop;
    }

    // --- THEME TOGGLE ---
    function applyTheme(theme) {
        if (theme === 'dark') {
            body.classList.add('dark-theme');
            if (themeToggleBtn) themeToggleBtn.textContent = 'Light Mode';
        } else {
            body.classList.remove('dark-theme');
            if (themeToggleBtn) themeToggleBtn.textContent = 'Dark Mode';
        }
    }

    function initThemeToggle() {
        if (!themeToggleBtn) return;
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = body.classList.contains('dark-theme') ? 'dark' : 'light';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(newTheme);
            localStorage.setItem('theme', newTheme);
        });
        const savedTheme = localStorage.getItem('theme') || 'light';
        applyTheme(savedTheme);
    }

    // --- FONT SIZE CONTROL ---
    function applyFontSize(size) {
        if (contentElement) contentElement.style.fontSize = size + 'px';
    }

    function initFontSizeControls() {
        if (!fontIncreaseBtn || !fontDecreaseBtn || !contentElement) return;
        currentFontSize = parseInt(localStorage.getItem('fontSize')) || DEFAULT_FONT_SIZE;
        applyFontSize(currentFontSize);

        fontIncreaseBtn.addEventListener('click', () => {
            if (currentFontSize < MAX_FONT_SIZE) {
                currentFontSize += FONT_SIZE_STEP;
                applyFontSize(currentFontSize);
                localStorage.setItem('fontSize', currentFontSize);
            }
        });

        fontDecreaseBtn.addEventListener('click', () => {
            if (currentFontSize > MIN_FONT_SIZE) {
                currentFontSize -= FONT_SIZE_STEP;
                applyFontSize(currentFontSize);
                localStorage.setItem('fontSize', currentFontSize);
            }
        });
    }

    // --- EXPAND/COLLAPSE ACT SECTIONS (MAIN CONTENT) ---
    function initExpandCollapse() {
        if (!contentElement) return;
        contentElement.querySelectorAll('.toggle-sections-btn').forEach(button => {
            const sectionsWrapperId = button.getAttribute('aria-controls');
            const sectionsWrapper = document.getElementById(sectionsWrapperId);
            if (!sectionsWrapper) {
                return;
            }
            const allInitiallyExpanded = !sectionsWrapper.querySelector('.section.collapsed-section');
            button.setAttribute('aria-expanded', allInitiallyExpanded.toString());
            button.textContent = allInitiallyExpanded ? 'Collapse Sections' : 'Expand Sections';
            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);
            newButton.addEventListener('click', () => {
                const isCurrentlyExpanded = newButton.getAttribute('aria-expanded') === 'true';
                sectionsWrapper.querySelectorAll('.section').forEach(s => {
                    s.classList.toggle('collapsed-section', isCurrentlyExpanded);
                });
                newButton.setAttribute('aria-expanded', (!isCurrentlyExpanded).toString());
                newButton.textContent = !isCurrentlyExpanded ? 'Collapse Sections' : 'Expand Sections';
                requestAnimationFrame(updateScrollSpy);
            });
        });
    }

    // --- COPY BUTTONS ---
    async function copySectionText(buttonElement) {
        const sectionDiv = buttonElement.closest('.section');
        if (sectionDiv) {
            const tempDiv = sectionDiv.cloneNode(true);
            const buttonInClone = tempDiv.querySelector('.copy-button');
            if (buttonInClone) buttonInClone.remove();
            const textToCopy = tempDiv.innerText.trim();
            try {
                await navigator.clipboard.writeText(textToCopy);
            } catch (err) {
                const textArea = document.createElement("textarea");
                textArea.value = textToCopy;
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                } catch (execErr) {
                    const fallbackMessage = document.createElement('div');
                    fallbackMessage.textContent = 'Failed to copy.';
                    fallbackMessage.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:10px;background:rgba(200,0,0,0.9);color:white;border-radius:5px;z-index:2000;font-size:0.9em;';
                    document.body.appendChild(fallbackMessage);
                    setTimeout(() => fallbackMessage.remove(), 3000);
                    return;
                }
                document.body.removeChild(textArea);
            }
            const originalText = buttonElement.textContent;
            buttonElement.textContent = 'Copied!';
            setTimeout(() => {
                if (document.body.contains(buttonElement)) {
                    buttonElement.textContent = originalText;
                }
            }, 1500);
        }
    }

    function addCopyButtons() {
        if (!contentElement) return;
        contentElement.querySelectorAll('.act-section .section h3').forEach(h3 => {
            let oldCopyBtn = h3.parentNode.querySelector('.copy-button[data-js-added="true"]');
            if (oldCopyBtn && (oldCopyBtn.previousElementSibling === h3 || h3.nextElementSibling === oldCopyBtn)) {
                oldCopyBtn.remove();
            }
            const button = document.createElement('button');
            button.textContent = 'Copy';
            button.className = 'copy-button';
            button.title = 'Copy section text';
            button.dataset.jsAdded = "true";
            button.onclick = (e) => copySectionText(e.target);
            h3.parentNode.insertBefore(button, h3.nextSibling);
        });
    }

    // --- TABLE OF CONTENTS & SCROLL SPY ---
    function handleTOCClick(event, targetHref) {
        event.preventDefault();
        const targetElement = document.querySelector(targetHref);
        if (targetElement) {
            const header = document.getElementById('top-controls-wrapper');
            const headerHeight = header ? header.offsetHeight : 0;
            const buffer = 20;

            scrollSpyOverrideId = targetElement.id;
            updateScrollSpy(); 
            setTimeout(() => { scrollSpyOverrideId = null; }, 1200);

            if (tocSidebar.classList.contains('collapsed')) {
                toggleTOC();
            }

            const parentActSection = targetElement.closest('.act-section');
            if (parentActSection) {
                const toggleBtn = parentActSection.querySelector('.toggle-sections-btn');
                if (toggleBtn && toggleBtn.getAttribute('aria-expanded') === 'false') {
                    toggleBtn.click();
                }
            }

            const targetAbsoluteTop = getAbsoluteTop(targetElement);
            const targetPosition = targetAbsoluteTop - headerHeight - buffer;

            window.scrollTo({ top: targetPosition, behavior: 'smooth' });

            if (history.pushState) {
                history.pushState(null, null, targetHref);
            } else {
                location.hash = targetHref;
            }

            if (window.innerWidth <= MOBILE_BREAKPOINT && tocSidebar && !tocSidebar.classList.contains('collapsed')) {
                setTimeout(() => toggleTOC(), 300);
            }
        }
    }

    function buildTOCAndPrepScrollSpy() {
        if (!tocList || !contentElement) {
            return;
        }
        tocList.innerHTML = '';
        tocLinks = [];
        contentHeadings = [];

        contentElement.querySelectorAll('.act-section').forEach(actDiv => {
            const actTitleElement = actDiv.querySelector('h2');
            if (!actTitleElement) return;

            const actId = actDiv.id || generateId(actTitleElement.textContent, "act");
            actTitleElement.id = actId;
            contentHeadings.push(actTitleElement);

            const actLi = document.createElement('li');
            const actA = document.createElement('a');
            actA.href = '#' + actId;
            actA.className = 'toc-act-title';

            const toggleIcon = document.createElement('span');
            const sectionsUl = document.createElement('ul');
            sectionsUl.className = 'toc-sections collapsed';
            toggleIcon.className = 'toc-act-toggle-icon collapsed';
            toggleIcon.innerHTML = '&#9656;';

            actA.appendChild(toggleIcon);
            actA.appendChild(document.createTextNode(" " + actTitleElement.textContent));

            actA.onclick = (e) => {
                const isIconClick = e.target === toggleIcon || e.target.closest('.toc-act-toggle-icon') === toggleIcon;
                if (sectionsUl.hasChildNodes() && isIconClick) {
                    e.preventDefault();
                    sectionsUl.classList.toggle('collapsed');
                    toggleIcon.classList.toggle('collapsed');
                    toggleIcon.innerHTML = sectionsUl.classList.contains('collapsed') ? '&#9656;' : '&#9662;';
                } else {
                    handleTOCClick(e, actA.getAttribute('href'));
                }
            };
            actLi.appendChild(actA);
            tocLinks.push(actA);

            let hasSubSections = false;
            actDiv.querySelectorAll('h3').forEach(h3 => {
                hasSubSections = true;
                const sectionId = h3.id || generateId(h3.textContent, actId + "-sec");
                h3.id = sectionId;
                contentHeadings.push(h3);

                const sectionLi = document.createElement('li');
                const sectionLink = document.createElement('a');
                sectionLink.href = '#' + sectionId;
                sectionLink.textContent = h3.textContent;
                sectionLink.onclick = (event) => handleTOCClick(event, sectionLink.getAttribute('href'));
                sectionLi.appendChild(sectionLink);
                sectionsUl.appendChild(sectionLi);
                tocLinks.push(sectionLink);
            });

            if (hasSubSections) {
                actLi.appendChild(sectionsUl);
            } else {
                toggleIcon.style.display = 'none';
                actA.onclick = (e) => handleTOCClick(e, actA.getAttribute('href'));
            }
            tocList.appendChild(actLi);
        });
    }

    function updateScrollSpy() {
        if (!tocLinks.length || !contentHeadings.length) {
            return;
        }
    
        let currentSectionId = null;
        let activeLinkElement = null;
        
        if (scrollSpyOverrideId) {
            currentSectionId = scrollSpyOverrideId;
        } else {
            const scrollPosition = window.scrollY + SCROLL_SPY_OFFSET;
            for (let i = contentHeadings.length - 1; i >= 0; i--) {
                const heading = contentHeadings[i];
                if (!document.body.contains(heading) || !heading.id) continue;
                const headingAbsoluteTop = getAbsoluteTop(heading);
                if (heading.tagName === 'H3') {
                    const parentActSection = heading.closest('.act-section');
                    const toggleBtn = parentActSection?.querySelector('.toggle-sections-btn');
                    if (toggleBtn && toggleBtn.getAttribute('aria-expanded') === 'false') continue;
                }
                if (headingAbsoluteTop <= scrollPosition) {
                    currentSectionId = heading.id;
                    break;
                }
            }
        }

        if (currentActStatusSpan) {
            if (currentSectionId) {
                const currentElement = document.getElementById(currentSectionId);
                const parentActSection = currentElement?.closest('.act-section');
                const actTitleElement = parentActSection?.querySelector('h2');
                if (actTitleElement) {
                    if (searchBox && searchBox.value.trim() === '') {
                        currentActStatusSpan.textContent = `(Current: ${actTitleElement.textContent.trim()})`;
                    }
                }
            } else {
                 if (searchBox && searchBox.value.trim() === '') {
                    currentActStatusSpan.textContent = '';
                }
            }
        }

        tocLinks.forEach(link => {
            if (document.body.contains(link)) link.classList.remove('active-toc-link');
        });
    
        if (currentSectionId) {
            const newActiveLink = tocList.querySelector(`a[href="#${currentSectionId}"]`);
            if (newActiveLink) {
                newActiveLink.classList.add('active-toc-link');
                activeLinkElement = newActiveLink;
            }
        }
    
        if (activeLinkElement) {
            const activeParentLi = activeLinkElement.closest('#toc-list > li');
            if (tocList) {
                tocList.querySelectorAll(':scope > li').forEach(li => {
                    const sublist = li.querySelector('ul.toc-sections');
                    const icon = li.querySelector('.toc-act-toggle-icon');
                    if (!sublist || !icon) return;
                    if (li === activeParentLi) {
                        if (sublist.classList.contains('collapsed')) {
                            sublist.classList.remove('collapsed');
                            icon.classList.remove('collapsed');
                            icon.innerHTML = '&#9662;';
                        }
                    } else {
                        if (!sublist.classList.contains('collapsed')) {
                            sublist.classList.add('collapsed');
                            icon.classList.add('collapsed');
                            icon.innerHTML = '&#9656;';
                        }
                    }
                });
            }
            if (!isInitialScrollSpyUpdate) {
                activeLinkElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    
        if (isInitialScrollSpyUpdate) isInitialScrollSpyUpdate = false;
    }

    // --- SEARCH FUNCTIONALITY ---

    // [NEW FUNCTION] For responsive placeholder
    function setSearchPlaceholder() {
        if (!searchBox) return;
        const placeholderText = window.innerWidth <= MOBILE_BREAKPOINT ? "Search..." : "Search... (Press /)";
        // Only update if not focused, to prevent visual jumps while typing.
        if (document.activeElement !== searchBox) {
            searchBox.placeholder = placeholderText;
        }
    }

    function populateSearchFilter() {
        if (!searchActFilter || !contentElement) return;
        const currentValue = searchActFilter.value;
        while (searchActFilter.options.length > 1) searchActFilter.remove(1);

        contentElement.querySelectorAll('.act-section').forEach(actDiv => {
            const actTitleElement = actDiv.querySelector('h2');
            if (actTitleElement) {
                const actId = actDiv.id || generateId(actTitleElement.textContent, "act-filter-option");
                actDiv.id = actId;
                const option = document.createElement('option');
                option.value = actId;
                option.textContent = actTitleElement.textContent;
                searchActFilter.appendChild(option);
            }
        });
        if (Array.from(searchActFilter.options).some(opt => opt.value === currentValue)) {
            searchActFilter.value = currentValue;
        }
    }

    function updateSearchStatus() {
        if (!searchStatusSpan || !prevMatchBtn || !nextMatchBtn) return;
        if (matches.length === 0) {
            searchStatusSpan.textContent = searchBox && searchBox.value.trim() ? '0 found' : '';
            prevMatchBtn.disabled = true;
            nextMatchBtn.disabled = true;
        } else {
            searchStatusSpan.textContent = `${currentMatchIndex + 1} of ${matches.length}`;
            prevMatchBtn.disabled = currentMatchIndex <= 0;
            nextMatchBtn.disabled = currentMatchIndex >= matches.length - 1;
        }
    }

    function goToMatch(index) {
        if (index < 0 || index >= matches.length) return;
        if (currentMatchIndex !== -1 && matches[currentMatchIndex] && document.body.contains(matches[currentMatchIndex])) {
            matches[currentMatchIndex].classList.remove('current-match');
        }
        currentMatchIndex = index;
        const currentElement = matches[currentMatchIndex];
        if (!currentElement || !document.body.contains(currentElement)) {
            if (currentActStatusSpan) currentActStatusSpan.textContent = '';
            updateSearchStatus();
            return;
        }
        const actSection = currentElement.closest('.act-section');
        if (actSection) {
            const toggleBtn = actSection.querySelector('.toggle-sections-btn');
            if (toggleBtn && toggleBtn.getAttribute('aria-expanded') === 'false') toggleBtn.click();
        }
        currentElement.classList.add('current-match');
        currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (actSection && currentActStatusSpan) {
            const actTitle = actSection.querySelector('h2');
            currentActStatusSpan.textContent = actTitle ? `(In: ${actTitle.textContent.trim()})` : '';
        } else if (currentActStatusSpan) {
            currentActStatusSpan.textContent = '';
        }
        updateSearchStatus();
    }

    function findAndHighlightIterative(rootNodeToSearch, termRegExp, scopeElementForCountingMatches) {
        const collectedSpans = [];
        const stack = [rootNodeToSearch];
        while (stack.length > 0) {
            const currentNode = stack.pop();
            if (currentNode.nodeType === Node.TEXT_NODE) {
                if (currentNode.parentNode.closest('script, style, #top-controls-wrapper, #toc-sidebar, button, input, textarea, select')) {
                    continue;
                }
                const text = currentNode.nodeValue;
                termRegExp.lastIndex = 0;
                let match;
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;
                let hasMatchesInThisNode = false;
                while ((match = termRegExp.exec(text)) !== null) {
                    hasMatchesInThisNode = true;
                    if (match.index > lastIndex) {
                        fragment.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
                    }
                    const span = document.createElement('span');
                    span.className = 'highlight';
                    span.appendChild(document.createTextNode(match[0]));
                    fragment.appendChild(span);
                    if (scopeElementForCountingMatches.contains(currentNode)) {
                        collectedSpans.push(span);
                    }
                    lastIndex = termRegExp.lastIndex;
                    if (termRegExp.lastIndex === match.index) termRegExp.lastIndex++;
                }
                if (hasMatchesInThisNode) {
                    if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                    if (currentNode.parentNode) currentNode.parentNode.replaceChild(fragment, currentNode);
                }
            } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
                const children = Array.from(currentNode.childNodes);
                for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
            }
        }
        return collectedSpans;
    }

    window.performSearch = function() {
        resetAndReinitializeContentFeatures(true);
        const searchTerm = searchBox ? searchBox.value.trim() : '';
        window.lastSearchedTerm = searchTerm;
        const filterValue = searchActFilter ? searchActFilter.value : 'all';
        const selectedOption = searchActFilter ? searchActFilter.options[searchActFilter.selectedIndex] : null;
        const searchCategory = selectedOption ? selectedOption.text : 'All Acts & Regulations';
        if (currentActStatusSpan) currentActStatusSpan.textContent = '';
        if (!searchTerm) {
            updateSearchStatus();
            updateScrollSpy();
            return;
        }
        if (typeof gtag === 'function') {
            gtag('event', 'search', { 'search_term': searchTerm.toLowerCase(), 'search_category': searchCategory });
        }
        const searchRegExp = new RegExp(escapeRegExp(searchTerm), 'gi');
        let searchScopeElement = contentElement;
        if (filterValue !== 'all') {
            const filteredEl = document.getElementById(filterValue);
            if (filteredEl && contentElement.contains(filteredEl)) {
                searchScopeElement = filteredEl;
                const toggleBtn = filteredEl.querySelector('.toggle-sections-btn');
                if (toggleBtn && toggleBtn.getAttribute('aria-expanded') === 'false') toggleBtn.click();
            }
        }
        matches = findAndHighlightIterative(contentElement, searchRegExp, searchScopeElement);
        currentMatchIndex = -1;
        if (matches.length > 0) {
            currentMatchIndex = 0;
            goToMatch(currentMatchIndex);
        }
        updateSearchStatus();
    }

    window.clearSearch = function(keepSearchTerm = false) {
        if (searchBox && !keepSearchTerm) searchBox.value = '';
        resetAndReinitializeContentFeatures(false);
        updateSearchStatus();
        if (currentActStatusSpan) currentActStatusSpan.textContent = '';
        updateScrollSpy();
    }

    window.goToNextMatch = function() {
        if (matches.length > 0 && currentMatchIndex < matches.length - 1) goToMatch(currentMatchIndex + 1);
        else if (matches.length > 0 && currentMatchIndex === matches.length - 1) goToMatch(0);
    }

    window.goToPreviousMatch = function() {
        if (matches.length > 0 && currentMatchIndex > 0) goToMatch(currentMatchIndex - 1);
        else if (matches.length > 0 && currentMatchIndex === 0) goToMatch(matches.length - 1);
    }

    // --- UI & BROWSER EVENT HANDLING ---
    function handleScrollButtonVisibility() {
        if (!scrollToTopButton) return;
        if (window.scrollY > 300) scrollToTopButton.classList.add('show');
        else scrollToTopButton.classList.remove('show');
    }

    function scrollToTopFunc() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

    function toggleTOC() {
        if (!tocSidebar || !tocToggleButton) return;
        tocSidebar.classList.toggle('collapsed');
        body.classList.toggle('toc-collapsed');
        body.classList.toggle('toc-open');
        tocToggleButton.innerHTML = tocSidebar.classList.contains('collapsed') ? '&#9776;' : '&times;';
    }

    function handleResponsiveTOC() {
        if (!tocSidebar || !tocToggleButton) return;
        if (window.innerWidth > MOBILE_BREAKPOINT) {
            body.classList.remove('toc-collapsed', 'toc-open');
            tocSidebar.classList.remove('collapsed');
            tocToggleButton.innerHTML = '&times;';
        } else {
            if (tocSidebar.classList.contains('collapsed')) {
                body.classList.add('toc-collapsed');
                body.classList.remove('toc-open');
                tocToggleButton.innerHTML = '&#9776;';
            } else {
                body.classList.remove('toc-collapsed');
                body.classList.add('toc-open');
                tocToggleButton.innerHTML = '&times;';
            }
        }
    }

    // --- INITIALIZATION ---
    function resetAndReinitializeContentFeatures() {
        if (contentElement && originalContentHTML) {
            contentElement.innerHTML = originalContentHTML;
        } else {
            return;
        }
        matches = [];
        currentMatchIndex = -1;
        isInitialScrollSpyUpdate = true;
        requestAnimationFrame(() => {
            addCopyButtons();
            initExpandCollapse();
            buildTOCAndPrepScrollSpy();
            populateSearchFilter();
            updateScrollSpy();
        });
    }

    function initializePage() {
        if (contentElement) {
            originalContentHTML = contentElement.innerHTML;
            resetAndReinitializeContentFeatures();
        } else {
            console.error("Main content element (#content) not found. Site functionality will be limited.");
        }

        initThemeToggle();
        initFontSizeControls();

        if (collapseAllSectionsBtn) {
            collapseAllSectionsBtn.addEventListener('click', () => {
                document.querySelectorAll('.toggle-sections-btn').forEach(button => {
                    if (button.getAttribute('aria-expanded') === 'true') button.click();
                });
                if (!tocSidebar.classList.contains('collapsed')) toggleTOC();
                tocList.querySelectorAll('.toc-sections').forEach(ul => {
                    if (!ul.classList.contains('collapsed')) {
                        ul.classList.add('collapsed');
                        const icon = ul.closest('li')?.querySelector('.toc-act-toggle-icon');
                        if (icon) {
                            icon.classList.add('collapsed');
                            icon.innerHTML = '&#9656;';
                        }
                    }
                });
            });
        }

        if (searchBox) {
            searchBox.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const currentSearchTermInBox = searchBox.value.trim();
                    if (matches.length > 0 && currentSearchTermInBox === window.lastSearchedTerm && currentMatchIndex < matches.length - 1) {
                        goToNextMatch();
                    } else {
                        performSearch();
                    }
                }
            });
            // [MODIFIED] Search placeholder handling
            searchBox.addEventListener('focus', function() { this.placeholder = 'Search...'; });
            searchBox.addEventListener('blur', function() { if (this.value === '') setSearchPlaceholder(); });

            document.addEventListener('keydown', function(event) {
                const targetElement = event.target;
                const isInput = targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA' || targetElement.tagName === 'SELECT';
                // Only enable '/' shortcut on non-mobile screens
                if (event.key === '/' && !isInput && window.innerWidth > MOBILE_BREAKPOINT) {
                    event.preventDefault();
                    if (searchBox) searchBox.focus();
                }
            });
        }
        if (searchActFilter) searchActFilter.addEventListener('change', performSearch);
        if (tocToggleButton) tocToggleButton.addEventListener('click', toggleTOC);
        if (scrollToTopButton) scrollToTopButton.addEventListener('click', scrollToTopFunc);

        window.addEventListener('scroll', () => {
            handleScrollButtonVisibility();
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(updateScrollSpy, 100);
        });

        window.addEventListener('resize', () => {
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                handleResponsiveTOC();
                updateScrollSpy();
                setSearchPlaceholder(); // [ADDED] Update placeholder on resize
            }, 150);
        });

        // Set initial states
        handleResponsiveTOC();
        setSearchPlaceholder(); // [ADDED] Set initial placeholder
        updateSearchStatus();
    }

    initializePage();
});