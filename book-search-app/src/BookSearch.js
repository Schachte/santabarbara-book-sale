import React, { useState, useEffect, useMemo } from 'react';
import { Search, X, Moon, BookOpen, Star, BookMarked, Copy, Check } from 'lucide-react';

const BookSearch = () => {
  // Function to open Google search for a book
  const searchBookOnGoogle = (book) => {
    const searchQuery = `${book.title} ${book.author} book`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    window.open(searchUrl, '_blank', 'noopener,noreferrer');
  };
  const [booksData, setBooksData] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeFilters, setActiveFilters] = useState([]);
  
  // New state for favorites functionality
  const [favorites, setFavorites] = useState([]);
  const [showFavoritesDrawer, setShowFavoritesDrawer] = useState(false);
  const [copied, setCopied] = useState(false);

  // Load data and initialize favorites from localStorage
  useEffect(() => {
    // First try to load favorites from localStorage
    try {
      const storedFavorites = localStorage.getItem('bookFavorites');
      if (storedFavorites) {
        setFavorites(JSON.parse(storedFavorites));
        console.log('Loaded favorites from localStorage:', JSON.parse(storedFavorites));
      }
    } catch (err) {
      console.error('Error loading favorites from localStorage:', err);
    }

    // Then fetch book data
    const fetchBooksData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/books.json');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch books data: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        setBooksData(data);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching books data:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchBooksData();
  }, []);
  
  // Save favorites to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('bookFavorites', JSON.stringify(favorites));
      console.log('Saved favorites to localStorage:', favorites);
    } catch (err) {
      console.error('Error saving favorites to localStorage:', err);
    }
  }, [favorites]);

  // Add genre filter when clicked
  const handleAddGenreFilter = (genre) => {
    if (!activeFilters.includes(genre)) {
      setActiveFilters([...activeFilters, genre]);
    }
  };

  // Remove genre filter
  const handleRemoveFilter = (filterToRemove) => {
    setActiveFilters(activeFilters.filter(filter => filter !== filterToRemove));
  };

  // Toggle favorite status
  const toggleFavorite = (book, e) => {
    e.stopPropagation(); // Prevent triggering search on Google
    
    if (favorites.some(fav => fav.id === book.id)) {
      setFavorites(favorites.filter(fav => fav.id !== book.id));
    } else {
      setFavorites([...favorites, book]);
    }
  };
  
  // Copy favorites list to clipboard
  const copyFavoritesToClipboard = () => {
    const text = "Hello, I am interested in the following books:\n" + 
      favorites.map(book => `- "${book.title}" by ${book.author}`).join('\n');
    
    navigator.clipboard.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  };

  // Filter books based on search term, category, and active filters
  const filteredBooks = useMemo(() => {
    return booksData.filter(book => {
      const searchTermLower = searchTerm.toLowerCase();
      
      // Check title match
      const titleMatch = book.title.toLowerCase().includes(searchTermLower);
      
      // Check author match
      const authorMatch = book.author.toLowerCase().includes(searchTermLower);
      
      // Check genre match - now genres is an array
      const genreMatch = book.genres ? book.genres.some(genre => 
        genre.toLowerCase().includes(searchTermLower)
      ) : false;
      
      // Check if book matches all active filters
      const matchesAllFilters = activeFilters.length === 0 || 
        activeFilters.every(filter => 
          book.genres && book.genres.some(genre => 
            genre.toLowerCase() === filter.toLowerCase()
          )
        );
      
      const matchesSearchTerm = titleMatch || authorMatch || genreMatch;
      
      // First check active filters, then check search term and category
      if (!matchesAllFilters) {
        return false;
      }

      if (filterCategory === 'all') {
        return matchesSearchTerm;
      } else if (filterCategory === 'title') {
        return titleMatch;
      } else if (filterCategory === 'author') {
        return authorMatch;
      } else if (filterCategory === 'genre') {
        return genreMatch;
      }
      return false;
    });
  }, [booksData, searchTerm, filterCategory, activeFilters]);

  // Generate autocomplete suggestions
  useEffect(() => {
    if (searchTerm.length > 1) {
      let suggestionSet = new Set();
      
      booksData.forEach(book => {
        if (filterCategory === 'all' || filterCategory === 'title') {
          if (book.title.toLowerCase().includes(searchTerm.toLowerCase())) {
            suggestionSet.add(book.title);
          }
        }
        if (filterCategory === 'all' || filterCategory === 'author') {
          if (book.author.toLowerCase().includes(searchTerm.toLowerCase())) {
            suggestionSet.add(book.author);
          }
        }
        if (filterCategory === 'all' || filterCategory === 'genre') {
          if (book.genres) {
            book.genres.forEach(genre => {
              if (genre.toLowerCase().includes(searchTerm.toLowerCase())) {
                suggestionSet.add(genre);
              }
            });
          }
        }
      });
      
      setSuggestions(Array.from(suggestionSet).slice(0, 5));
      setShowSuggestions(suggestionSet.size > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, [searchTerm, filterCategory, booksData]);

  // Handle search term change
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Handle suggestion selection
  const handleSuggestionClick = (suggestion) => {
    setSearchTerm(suggestion);
    setShowSuggestions(false);
  };

  // Handle filter category change
  const handleCategoryChange = (e) => {
    setFilterCategory(e.target.value);
  };

  // Get unique genres for filter dropdown
  const genres = useMemo(() => {
    const genreSet = new Set();
    booksData.forEach(book => {
      if (book.genres) {
        book.genres.forEach(genre => genreSet.add(genre));
      }
    });
    return [...genreSet].sort();
  }, [booksData]);

  // Function to handle image loading errors
  const handleImageError = (e) => {
    e.target.onerror = null; // Prevent infinite callbacks
    e.target.src = `https://via.placeholder.com/120x160/2d3748/e2e8f0?text=${encodeURIComponent(e.target.title.substring(0, 10))}`;
  };
  return (
    <div className="min-h-screen bg-gray-900 py-8 px-4 text-gray-100">
      <div className="max-w-6xl mx-auto">
        <div className="bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-700 relative">
          {/* Header */}
          <div className="p-4 md:p-6 bg-gradient-to-r from-purple-800 to-indigo-900 relative overflow-hidden">
            <div className="absolute top-0 right-0 opacity-10">
              <BookOpen size={180} />
            </div>
            <div className="relative z-10">
              <h1 className="text-2xl md:text-3xl font-bold text-white mb-2 flex items-center">
                <span role="img" aria-label="book" className="mr-2">📚☀️</span>
                Santa Barbara Book Sale
              </h1>
              <p className="text-indigo-200 max-w-xl text-sm md:text-base">
                Search and favorite books you'd like to buy. You can copy the entire list to your clipboard by clicking "Favorites" and then "Copy List".
              </p>
            </div>
          </div>
          
          {/* Search Bar - Mobile Responsive with each element on its own row */}
          <div className="p-4 md:p-6 border-b border-gray-700">
            {/* Mobile-first layout with flex-col */}
            <div className="flex flex-col gap-3">
              {/* Search input with integrated icon */}
              <div className="w-full relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  className="block w-full pl-10 pr-3 py-3 rounded-lg border border-gray-600 bg-gray-700 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-100 placeholder-gray-400"
                  placeholder="Search books..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onFocus={() => setShowSuggestions(suggestions.length > 0)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                />
                {showSuggestions && (
                  <div className="absolute z-10 w-full mt-1 bg-gray-800 rounded-lg shadow-lg border border-gray-600">
                    <ul>
                      {suggestions.map((suggestion, index) => (
                        <li
                          key={index}
                          className="px-4 py-2 hover:bg-gray-700 cursor-pointer text-gray-200"
                          onClick={() => handleSuggestionClick(suggestion)}
                        >
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              
              {/* Category filter - styled like the screenshot */}
              <div className="w-full">
                <select
                  className="block w-full py-3 px-4 border border-gray-600 bg-gray-700 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-gray-200"
                  value={filterCategory}
                  onChange={handleCategoryChange}
                >
                  <option value="all">All</option>
                  <option value="title">Title</option>
                  <option value="author">Author</option>
                  <option value="genre">Genre</option>
                </select>
              </div>
              
              {/* Favorites button - styled like the screenshot */}
              <div className="w-full">
                <button 
                  className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 px-4 rounded-lg flex items-center justify-center transition-colors duration-200 shadow-lg font-medium border border-gray-600"
                  onClick={() => setShowFavoritesDrawer(true)}
                >
                  <BookMarked className="mr-2 h-5 w-5" />
                  <span>Favorites ({favorites.length})</span>
                </button>
              </div>
            </div>
            
            {/* Active Filters */}
            {activeFilters.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="text-sm text-gray-400 py-1">Active filters:</span>
                {activeFilters.map((filter, index) => (
                  <div 
                    key={index} 
                    className="inline-flex items-center bg-indigo-900 text-indigo-200 text-sm px-3 py-1 rounded-full"
                  >
                    {filter}
                    <button 
                      className="ml-1 text-indigo-300 hover:text-indigo-100 focus:outline-none"
                      onClick={() => handleRemoveFilter(filter)}
                      title="Remove filter"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  className="text-sm text-gray-400 hover:text-gray-200 py-1 px-2 underline"
                  onClick={() => setActiveFilters([])}
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
          
          {/* Book List */}
          <div className="p-4 md:p-6">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-red-400">Error: {error}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                {filteredBooks.length > 0 ? (
                  filteredBooks.map(book => {
                    // Create the Google search URL for the book title and author
                    const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`${book.title} ${book.author} book`)}`;
                    const isFavorite = favorites.some(fav => fav.id === book.id);
                    
                    return (
                      <div 
                        key={book.id} 
                        className="border border-gray-700 rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col h-full cursor-pointer group bg-gray-800 relative"
                        onClick={() => window.open(googleSearchUrl, '_blank', 'noopener,noreferrer')}
                        title={`Search for "${book.title}" by ${book.author} on Google`}
                      >
                        {/* Star button for favorites */}
                        <button
                          className={`absolute top-2 right-2 z-20 bg-gray-800 rounded-full p-1 transition-colors duration-200 ${
                            isFavorite ? 'text-amber-300 hover:text-amber-200' : 'text-gray-400 hover:text-amber-300'
                          }`}
                          onClick={(e) => toggleFavorite(book, e)}
                          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star className={`h-6 w-6 ${isFavorite ? 'fill-current' : ''}`} />
                        </button>
                        
                        <div className="h-48 bg-gray-700 flex items-center justify-center relative overflow-hidden">
                          {/* Blurred background stretched image */}
                          <div className="absolute inset-0 z-0">
                            <img 
                              src={`/covers/${book.id}.jpg`}
                              alt=""
                              className="h-full w-full object-cover blur-md scale-110 opacity-60"
                              onError={handleImageError}
                            />
                          </div>
                          
                          {/* Non-stretched, properly sized foreground image */}
                          <div className="relative z-10 h-full flex items-center justify-center p-2">
                            <img 
                              src={`/covers/${book.id}.jpg`} 
                              alt={`Cover of ${book.title}`}
                              title={book.title}
                              className="h-full max-h-full object-contain shadow-xl"
                              onError={handleImageError}
                            />
                          </div>
                          
                          {/* Hover overlay */}
                          <div className="absolute inset-0 z-20 bg-black bg-opacity-0 group-hover:bg-opacity-70 transition-all duration-300 flex items-center justify-center">
                            <span className="text-white opacity-0 group-hover:opacity-100 bg-purple-600 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 transform translate-y-4 group-hover:translate-y-0">
                              Search on Google
                            </span>
                          </div>
                        </div>
                        <div className="p-4 flex-grow flex flex-col">
                          <h3 className="font-bold text-base mb-1 line-clamp-2 group-hover:text-purple-400 transition-colors duration-200" title={book.title}>{book.title}</h3>
                          <p className="text-gray-400 text-sm mb-3 line-clamp-1" title={book.author}>{book.author}</p>
                          <div className="mt-auto flex flex-wrap gap-1">
                            {book.genres && book.genres.map((genre, index) => (
                              <span 
                                key={index} 
                                className="inline-block bg-indigo-900/50 text-indigo-300 text-xs px-2 py-1 rounded-full cursor-pointer hover:bg-indigo-800 transition-colors duration-200"
                                title={`Filter by ${genre}`}
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent triggering the parent's onClick
                                  handleAddGenreFilter(genre);
                                }}
                              >
                                {genre}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-full text-center py-12">
                    <p className="text-gray-400">No books found matching your search criteria.</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="px-4 md:px-6 py-3 md:py-4 bg-gray-900 border-t border-gray-700">
            <p className="text-sm text-gray-500">
              {filteredBooks.length} book{filteredBooks.length !== 1 ? 's' : ''} found
            </p>
          </div>
          
          {/* Favorites Drawer - Full width on mobile */}
          {showFavoritesDrawer && (
            <>
              {/* Backdrop overlay - clicking this will close the drawer */}
              <div 
                className="fixed inset-0 bg-black bg-opacity-50 z-50" 
                onClick={() => setShowFavoritesDrawer(false)}
              ></div>
              
              {/* Drawer content - full width on mobile */}
              <div className="fixed inset-y-0 right-0 bg-gray-800 w-full sm:w-3/4 md:w-2/3 lg:max-w-md h-full overflow-auto border-l border-gray-700 shadow-xl transform transition-transform duration-300 z-50">
                <div className="sticky top-0 bg-gray-800 z-10 border-b border-gray-700">
                  <div className="p-4 flex justify-between items-center bg-gradient-to-r from-amber-700 to-amber-600">
                    <h2 className="text-lg md:text-xl font-bold text-white flex items-center">
                      <BookMarked className="mr-2 h-5 w-5" />
                      My Favorites ({favorites.length})
                    </h2>
                    <button 
                      className="text-gray-200 hover:text-white focus:outline-none"
                      onClick={() => setShowFavoritesDrawer(false)}
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>
                  
                  {favorites.length > 0 && (
                    <div className="p-4 flex justify-between items-center border-b border-gray-700">
                      <p className="text-sm text-gray-300">
                        Your favorite books collection
                      </p>
                      <button 
                        className="bg-amber-600 hover:bg-amber-500 text-white py-2 px-3 rounded-lg flex items-center text-sm transition-colors duration-200 shadow-lg font-medium border border-amber-500"
                        onClick={copyFavoritesToClipboard}
                      >
                        {copied ? (
                          <>
                            <Check className="mr-1 h-4 w-4" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="mr-1 h-4 w-4" />
                            <span>Copy List</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="p-4">
                  {favorites.length === 0 ? (
                    <div className="text-center py-12">
                      <BookOpen className="mx-auto h-12 w-12 text-gray-500 mb-4" />
                      <p className="text-gray-400">No favorites added yet</p>
                      <p className="text-gray-500 text-sm mt-2">Click the star icon on any book to add it to your favorites</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {favorites.map(book => (
                        <div 
                          key={book.id}
                          className="flex items-start gap-4 p-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors duration-200 group"
                        >
                          <div className="h-20 w-16 flex-shrink-0 bg-gray-600 rounded overflow-hidden">
                            <img
                              src={`/covers/${book.id}.jpg`}
                              alt={`Cover of ${book.title}`}
                              className="h-full w-full object-cover"
                              onError={handleImageError}
                            />
                          </div>
                          <div className="flex-grow min-w-0">
                            <h3 className="font-medium text-gray-100 line-clamp-1">{book.title}</h3>
                            <p className="text-gray-400 text-sm line-clamp-1">{book.author}</p>
                            {book.genres && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {book.genres.slice(0, 2).map((genre, index) => (
                                  <span
                                    key={index}
                                    className="text-indigo-300 text-xs"
                                  >
                                    {genre}{index < Math.min(book.genres.length, 2) - 1 ? ',' : ''}
                                  </span>
                                ))}
                                {book.genres.length > 2 && (
                                  <span className="text-gray-400 text-xs">+{book.genres.length - 2} more</span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex-shrink-0 flex gap-2">
                            <button
                              className="text-gray-400 hover:text-yellow-400 focus:outline-none transition-colors duration-200"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(book, e);
                              }}
                              title="Remove from favorites"
                            >
                              <Star className="h-5 w-5 fill-current text-amber-300" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookSearch;