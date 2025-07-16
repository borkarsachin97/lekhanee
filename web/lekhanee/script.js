// Theme toggle functionality
const themeToggle = document.getElementById('themeToggle');
const body = document.body;

// Initialize theme
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        body.classList.add('dark-theme');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i><span>Light Mode</span>';
    } else {
        body.classList.remove('dark-theme');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i><span>Dark Mode</span>';
    }
}

// Toggle theme
themeToggle.addEventListener('click', () => {
    if (body.classList.contains('dark-theme')) {
        body.classList.remove('dark-theme');
        localStorage.setItem('theme', 'light');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i><span>Dark Mode</span>';
    } else {
        body.classList.add('dark-theme');
        localStorage.setItem('theme', 'dark');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i><span>Light Mode</span>';
    }
});

// Load JSON data and render books
async function loadBooks() {
    try {
        const response = await fetch('library.json');
        const data = await response.json();
        renderBooks(data.books);
        updateStats(data.books);
        setupFilters(data.books);
        setupSearch(data.books);
    } catch (error) {
        console.error('Error loading library data:', error);
        document.getElementById('bookGrid').innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Failed to load library data. Please check your JSON file.</p>
            </div>
        `;
    }
}

// Render books to the grid
function renderBooks(books) {
    const bookGrid = document.getElementById('bookGrid');
    
    if (books.length === 0) {
        bookGrid.innerHTML = `
            <div class="no-results">
                <i class="fas fa-book-open"></i>
                <p>No books found. Try a different search or filter.</p>
            </div>
        `;
        return;
    }
    
    bookGrid.innerHTML = '';
    
    books.forEach(book => {
        const bookCard = document.createElement('div');
        bookCard.className = 'book-card';
        
        bookCard.innerHTML = `
            <div class="thumbnail-container">
                ${book.thumbnail ? 
                    `<img src="thumbnails/${book.thumbnail}" alt="${book.title}" class="thumbnail">` : 
                    `<div class="thumbnail-placeholder"><i class="fas fa-book"></i></div>`
                }
            </div>
            <div class="book-info">
                <div class="book-category">${book.category}</div>
                <h2 class="book-title">${book.title}</h2>
                <div class="book-author">by ${book.author}</div>
                <a href="../viewer.html?file=lekhanee/pdfs/${book.pdf}" target="_blank" class="view-btn">
                    <i class="fas fa-eye"></i> View PDF
                </a>
                <div class="book-meta">
                    <span>${book.pages} pages</span>
                    <span>${book.size}</span>
                </div>
            </div>
        `;
        
        bookGrid.appendChild(bookCard);
    });
}

// Update statistics
function updateStats(books) {
    document.getElementById('totalBooks').textContent = books.length;
    
    const totalPages = books.reduce((sum, book) => sum + parseInt(book.pages), 0);
    document.getElementById('totalPages').textContent = totalPages.toLocaleString();
    
    const categories = new Set(books.map(book => book.category));
    document.getElementById('categories').textContent = categories.size;
}

// Setup filters
function setupFilters(books) {
    const filterButtons = document.querySelectorAll('.filter-btn');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active state
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');
            
            // Filter books
            const filter = button.dataset.filter;
            let filteredBooks = books;
            
            if (filter !== 'all') {
                filteredBooks = books.filter(book => book.category.toLowerCase() === filter);
            }
            
            renderBooks(filteredBooks);
        });
    });
}

// Setup search
function setupSearch(books) {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    
    const performSearch = () => {
        const searchTerm = searchInput.value.toLowerCase().trim();
        
        if (searchTerm === '') {
            renderBooks(books);
            return;
        }
        
        const filteredBooks = books.filter(book => {
            return book.title.toLowerCase().includes(searchTerm) ||
                   book.author.toLowerCase().includes(searchTerm) ||
                   book.category.toLowerCase().includes(searchTerm) ||
                   book.description.toLowerCase().includes(searchTerm);
        });
        
        renderBooks(filteredBooks);
    };
    
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    loadBooks();
});
