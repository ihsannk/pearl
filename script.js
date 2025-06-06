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

    // --- State Variables ---
    let matches = [];
    let currentMatchIndex = -1;
    let tocLinks = [];
    let contentHeadings = [];
    let currentFontSize = parseInt(localStorage.getItem('fontSize')) || 16;
    let scrollTimeout;
    window.lastSearchedTerm = '';
    let isInitialScrollSpyUpdate = true;

    // --- Constants ---
    const DEFAULT_FONT_SIZE = 16;
    const FONT_SIZE_STEP = 1;
    const MIN_FONT_SIZE = 12;
    const MAX_FONT_SIZE = 24;
    const SCROLL_SPY_OFFSET = 180;

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
        } else {
            // console.warn("generateId received non-string/number text:", text);
        }
        return `${basePrefix}-${idText}`;
    }

    // Helper function to get an element's absolute top position relative to the document
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
                // console.warn('Sections wrapper not found for button:', button);
                return;
            }
            const anySectionInitiallyCollapsed = sectionsWrapper.querySelector('.section.collapsed-section');
            const allInitiallyExpanded = !anySectionInitiallyCollapsed;

            button.setAttribute('aria-expanded', allInitiallyExpanded.toString());
            button.textContent = allInitiallyExpanded ? 'Collapse Sections' : 'Expand Sections';

            const newButton = button.cloneNode(true);
            button.parentNode.replaceChild(newButton, button);

            newButton.addEventListener('click', () => {
                const isCurrentlyExpanded = newButton.getAttribute('aria-expanded') === 'true';
                sectionsWrapper.querySelectorAll('.section').forEach(s => {
                    s.classList.toggle('collapsed-section', isCurrentlyExpanded);
                });
                newButton.setAttribute('aria-expanded', !isCurrentlyExpanded);
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
                    console.error('Fallback copy failed: ', execErr);
                    const fallbackMessage = document.createElement('div');
                    fallbackMessage.textContent = 'Failed to copy. Please try again or copy manually.';
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
            const targetAbsoluteTop = getAbsoluteTop(targetElement); // Use absolute top for scrolling target
            const targetPosition = targetAbsoluteTop - headerHeight - buffer;


            window.scrollTo({ top: targetPosition, behavior: 'smooth' });

            if (history.pushState) {
                history.pushState(null, null, targetHref);
            } else {
                location.hash = targetHref;
            }
            if (window.innerWidth <= 900 && tocSidebar && !tocSidebar.classList.contains('collapsed')) {
                toggleTOC();
            }
        }
    }

    function buildTOCAndPrepScrollSpy() {
        if (!tocList || !contentElement) {
            console.error("buildTOCAndPrepScrollSpy: tocList or contentElement not found.");
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
            if (actTitleElement.offsetParent === null) {
                console.warn(`Heading ${actId} (H2) is not rendered or has no offsetParent. offsetTop/absoluteTop will be unreliable.`);
            }
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
                const isIconClick = e.target === toggleIcon || e.target.parentElement === toggleIcon;
                if (sectionsUl.hasChildNodes() && (isIconClick || e.target === actA)) {
                    e.preventDefault();
                    sectionsUl.classList.toggle('collapsed');
                    toggleIcon.classList.toggle('collapsed');
                    toggleIcon.innerHTML = sectionsUl.classList.contains('collapsed') ? '&#9656;' : '&#9662;';
                }
                if (!isIconClick && e.target === actA) {
                    handleTOCClick(e, actA.getAttribute('href'));
                } else if (isIconClick && sectionsUl.classList.contains('collapsed')) {
                    // No nav
                } else if (!isIconClick) {
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
                if (h3.offsetParent === null) {
                     console.warn(`Heading ${sectionId} (H3) is not rendered or has no offsetParent. offsetTop/absoluteTop will be unreliable.`);
                }
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
        // console.log("TOC built. Links:", tocLinks.length, "Headings:", contentHeadings.length);
    }

    function updateScrollSpy() {
        console.log("--- updateScrollSpy CALLED ---"); // LOG 3 (Enabled)

        if (!tocLinks.length || !contentHeadings.length) {
            console.log("Exiting updateScrollSpy: No ToC links or content headings.");
            return;
        }

        let currentSectionId = null;
        const scrollPosition = window.scrollY + SCROLL_SPY_OFFSET;
        console.log(`Current window.scrollY: ${window.scrollY}, SCROLL_SPY_OFFSET: ${SCROLL_SPY_OFFSET}, Calculated scrollPosition: ${scrollPosition}`); // LOG 4 (Enabled)

        let foundHeadingLog = "";

        for (let i = contentHeadings.length - 1; i >= 0; i--) {
            const heading = contentHeadings[i];

            if (!document.body.contains(heading) || !heading.id) {
                continue;
            }

            const headingAbsoluteTop = getAbsoluteTop(heading); // USE THE HELPER FUNCTION

            const isH3 = heading.tagName === 'H3';
            let isSkippedDueToCollapse = false;
            if (isH3) {
                const parentActSection = heading.closest('.act-section');
                if (parentActSection) {
                    const toggleBtn = parentActSection.querySelector('.toggle-sections-btn');
                    if (toggleBtn && toggleBtn.getAttribute('aria-expanded') === 'false') {
                       isSkippedDueToCollapse = true;
                    }
                }
            }

            // LOG 5 (Enabled for detailed analysis)
            console.log(
                `Checking heading: ${heading.id} (index ${i}), ` +
                `absoluteTop: ${headingAbsoluteTop}, originalOffsetTop: ${heading.offsetTop}, ` +
                `offsetParent: ${heading.offsetParent ? heading.offsetParent.id || heading.offsetParent.tagName : 'null'}, ` +
                `tagName: ${heading.tagName}, ` +
                `isH3InCollapsedAct: ${isSkippedDueToCollapse}, ` +
                `Condition (absoluteTop <= scrollPosition): ${headingAbsoluteTop <= scrollPosition}`
            );


            if (isSkippedDueToCollapse) {
                console.log(`Skipped ${heading.id} because its act section is collapsed.`); // LOG 6 (Enabled)
                continue;
            }

            if (headingAbsoluteTop <= scrollPosition) {
                currentSectionId = heading.id;
                foundHeadingLog = `Found match: ${heading.id}, absoluteTop: ${headingAbsoluteTop}, tagName: ${heading.tagName}`;
                console.log(`Potential currentSectionId: ${currentSectionId} (absoluteTop: ${headingAbsoluteTop})`); // LOG 7 (Enabled)
                break;
            }
        }

        console.log(`Final currentSectionId after loop: ${currentSectionId}. ${foundHeadingLog}`); // LOG 8 (Enabled)

        let highlightedLinkFound = false;
        tocLinks.forEach(link => {
            if (!document.body.contains(link)) return;
            link.classList.remove('active-toc-link');
            if (link.getAttribute('href') === '#' + currentSectionId) {
                link.classList.add('active-toc-link');
                highlightedLinkFound = true;
                const parentActLi = link.closest('ul.toc-sections')?.closest('li');
                if (parentActLi) {
                    const parentActSublist = parentActLi.querySelector('ul.toc-sections');
                    const parentActToggleIcon = parentActLi.querySelector('.toc-act-toggle-icon');
                    if (!isInitialScrollSpyUpdate && parentActSublist && parentActSublist.classList.contains('collapsed')) {
                        parentActSublist.classList.remove('collapsed');
                        if (parentActToggleIcon) {
                            parentActToggleIcon.classList.remove('collapsed');
                            parentActToggleIcon.innerHTML = '&#9662;';
                        }
                    }
                }
            }
        });
        console.log(`Any link highlighted for #${currentSectionId}? ${highlightedLinkFound}`); // LOG 9 (Enabled)

        if (isInitialScrollSpyUpdate) isInitialScrollSpyUpdate = false;
        console.log("--- updateScrollSpy ENDED ---"); // LOG 10 (Enabled)
    }


    // --- SEARCH FILTER POPULATION ---
    function populateSearchFilter() {
        if (!searchActFilter || !contentElement) return;
        const currentValue = searchActFilter.value;
        while (searchActFilter.options.length > 1) { searchActFilter.remove(1); }

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

    // --- SEARCH FUNCTIONALITY ---
    function updateSearchStatus() {
        if (!searchStatusSpan || !prevMatchBtn || !nextMatchBtn) return;
        if (matches.length === 0) {
            searchStatusSpan.textContent = searchBox && searchBox.value.trim() ? '0 found' : '';
            prevMatchBtn.disabled = true;
            nextMatchBtn.disabled = true;
            if (currentActStatusSpan) currentActStatusSpan.textContent = '';
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

        currentElement.classList.add('current-match');
        currentElement.scrollIntoView({ behavior: 'smooth', block: 'center' });

        const actSection = currentElement.closest('.act-section');
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
                    if (termRegExp.lastIndex === match.index) {
                        termRegExp.lastIndex++;
                    }
                }

                if (hasMatchesInThisNode) {
                    if (lastIndex < text.length) {
                        fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                    }
                    if (currentNode.parentNode) {
                        currentNode.parentNode.replaceChild(fragment, currentNode);
                    }
                }
            } else if (currentNode.nodeType === Node.ELEMENT_NODE) {
                const children = Array.from(currentNode.childNodes);
                for (let i = children.length - 1; i >= 0; i--) {
                    stack.push(children[i]);
                }
            }
        }
        return collectedSpans;
    }

    window.performSearch = function() {
        // Existing reset and reinitialization logic
        resetAndReinitializeContentFeatures(true); // Pass true to indicate search context

        const searchTerm = searchBox ? searchBox.value.trim() : '';
        window.lastSearchedTerm = searchTerm; // Update global last searched term
        
        const filterValue = searchActFilter ? searchActFilter.value : 'all';
        const selectedOption = searchActFilter ? searchActFilter.options[searchActFilter.selectedIndex] : null;
        const searchCategory = selectedOption ? selectedOption.text : 'All Acts & Regulations'; // Get the text of the selected filter

        if (!searchTerm) {
            updateSearchStatus();
            return;
        }

        // **** ADD THIS CODE TO SEND DATA TO GOOGLE ANALYTICS ****
        if (typeof gtag === 'function') {
            gtag('event', 'search', {
                'search_term': searchTerm.toLowerCase(), // Send search term (good practice to lowercase)
                'search_category': searchCategory      // Send the selected act/filter
            });
            console.log(`GA Event Sent: search, search_term: ${searchTerm.toLowerCase()}, search_category: ${searchCategory}`); // For your debugging
        }
        // *********************************************************

        const searchRegExp = new RegExp(escapeRegExp(searchTerm), 'gi');
        let searchScopeElement = contentElement;
        if (filterValue !== 'all') {
            const filteredEl = document.getElementById(filterValue);
            if (filteredEl && contentElement.contains(filteredEl)) {
                searchScopeElement = filteredEl;
            } else {
                // console.warn(`Search filter ID "${filterValue}" not found or not in #content. Defaulting to all content.`);
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
        if (searchBox && !keepSearchTerm) {
            searchBox.value = '';
        }
        resetAndReinitializeContentFeatures(false);
        updateSearchStatus();
        if (currentActStatusSpan) currentActStatusSpan.textContent = '';
    }

    window.goToNextMatch = function() {
        if (currentMatchIndex < matches.length - 1) {
            goToMatch(currentMatchIndex + 1);
        }
    }

    window.goToPreviousMatch = function() {
        if (currentMatchIndex > 0) {
            goToMatch(currentMatchIndex - 1);
        }
    }

    // --- SCROLL TO TOP ---
    function handleScrollButtonVisibility() {
        if (!scrollToTopButton) return;
        if (window.scrollY > 300) scrollToTopButton.classList.add('show');
        else scrollToTopButton.classList.remove('show');
    }
    function scrollToTopFunc() { window.scrollTo({ top: 0, behavior: 'smooth' }); }

    // --- TOC SIDEBAR TOGGLE ---
    function toggleTOC() {
        if (!tocSidebar || !tocToggleButton) return;
        tocSidebar.classList.toggle('collapsed');
        body.classList.toggle('toc-collapsed');
        body.classList.toggle('toc-open');
        tocToggleButton.innerHTML = tocSidebar.classList.contains('collapsed') ? '&#9776;' : '&times;';
    }

    // --- RESPONSIVE TOC BEHAVIOR ---
    function handleResponsiveTOC() {
        if (!tocSidebar || !tocToggleButton) return;
        if (window.innerWidth > 900) {
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

    // --- CENTRAL RE-INITIALIZATION FUNCTION ---
    function resetAndReinitializeContentFeatures(isSearchContext = false) {
        if (contentElement && originalContentHTML) {
            contentElement.innerHTML = originalContentHTML;
        } else {
            console.error("Cannot reset content: contentElement or originalContentHTML missing.");
            return;
        }

        matches = [];
        currentMatchIndex = -1;
        isInitialScrollSpyUpdate = true;

        requestAnimationFrame(() => {
            console.log("--- resetAndReinitializeContentFeatures: Inside requestAnimationFrame ---"); // LOG 1 (Enabled)
            addCopyButtons();
            initExpandCollapse();
            buildTOCAndPrepScrollSpy();

            // LOG 2 (Enabled) - Log heading info immediately after buildTOCAndPrepScrollSpy
            if (contentHeadings.length > 0) {
                console.log("Sample heading data immediately after buildTOCAndPrepScrollSpy (using getAbsoluteTop):");
                contentHeadings.slice(0, Math.min(5, contentHeadings.length)).forEach(h => console.log(`  ID: ${h.id}, Tag: ${h.tagName}, absoluteTop: ${getAbsoluteTop(h)}, originalOffsetTop: ${h.offsetTop}, offsetParent: ${h.offsetParent ? h.offsetParent.id || h.offsetParent.tagName : 'null'}, Text: "${h.textContent.substring(0,30)}..."`));
                if (contentHeadings.length > 5) {
                   const lastH = contentHeadings[contentHeadings.length - 1];
                   console.log(`  LAST ID: ${lastH.id}, Tag: ${lastH.tagName}, absoluteTop: ${getAbsoluteTop(lastH)}, originalOffsetTop: ${lastH.offsetTop}, offsetParent: ${lastH.offsetParent ? lastH.offsetParent.id || lastH.offsetParent.tagName : 'null'}, Text: "${lastH.textContent.substring(0,30)}..."`);
                }
            } else {
                console.log("contentHeadings is empty after buildTOCAndPrepScrollSpy (within rAF).");
            }

            populateSearchFilter();
            updateScrollSpy();
        });
    }


    // --- INITIAL DOM SETUP ---
    function initializePage() {
        if (contentElement) {
            originalContentHTML = contentElement.innerHTML;
            resetAndReinitializeContentFeatures();
        } else {
            console.error("Main content element (#content) not found. Site functionality will be limited.");
        }

        initThemeToggle();
        initFontSizeControls();

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
            const fullPlaceholderText = "Search... (Press /)";
            const focusedPlaceholderText = "Search...";
            searchBox.placeholder = fullPlaceholderText;
            searchBox.addEventListener('focus', function() { this.placeholder = focusedPlaceholderText; });
            searchBox.addEventListener('blur', function() { if (this.value === '') this.placeholder = fullPlaceholderText; });
            document.addEventListener('keydown', function(event) {
                const targetElement = event.target;
                const isInput = targetElement.tagName === 'INPUT' || targetElement.tagName === 'TEXTAREA' || targetElement.tagName === 'SELECT';
                if (event.key === '/' && !isInput) {
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
            }, 150);
        });
        handleResponsiveTOC(); // Initial call to set responsive TOC state

        // updateScrollSpy(); // Initial call is handled by resetAndReinitializeContentFeatures
        updateSearchStatus(); // Initial search status
    }

    initializePage(); // Call the main initialization function

});