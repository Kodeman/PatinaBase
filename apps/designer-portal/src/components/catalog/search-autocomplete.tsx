'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Search as SearchIcon, Clock, TrendingUp, X } from 'lucide-react';
import { Input } from '@patina/design-system';
import { Badge } from '@patina/design-system';
import { useAutocomplete } from '@/hooks/use-search';
import { debounce } from '@/lib/utils';

interface SearchAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchAutocomplete({
  value,
  onChange,
  onSearch,
  placeholder = 'Search products...',
  className = '',
}: SearchAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced autocomplete query (150ms)
  const debouncedSetQuery = useMemo(
    () =>
      debounce((query: string) => {
        setDebouncedQuery(query);
      }, 150),
    []
  );

  // Fetch autocomplete suggestions
  const { data: autocompleteData, isLoading } = useAutocomplete(debouncedQuery);
  const suggestions = (autocompleteData as any)?.suggestions || [];

  // Load search history from localStorage
  useEffect(() => {
    try {
      const history = localStorage.getItem('searchHistory');
      if (history) {
        setSearchHistory(JSON.parse(history));
      }
    } catch (error) {
      console.error('Failed to load search history:', error);
    }
  }, []);

  // Update debounced query when value changes
  useEffect(() => {
    if (value.length >= 2) {
      debouncedSetQuery(value);
    } else {
      setDebouncedQuery('');
    }
  }, [value, debouncedSetQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (newValue: string) => {
    onChange(newValue);
    setIsOpen(true);
  };

  const handleInputFocus = () => {
    setIsOpen(true);
  };

  const handleSelectSuggestion = (suggestion: string) => {
    onChange(suggestion);
    setIsOpen(false);
    addToSearchHistory(suggestion);
    onSearch(suggestion);
  };

  const handleSearch = (query: string) => {
    if (query.trim()) {
      addToSearchHistory(query);
      onSearch(query);
      setIsOpen(false);
    }
  };

  const addToSearchHistory = (query: string) => {
    try {
      const newHistory = [query, ...searchHistory.filter((q) => q !== query)].slice(0, 5);
      setSearchHistory(newHistory);
      localStorage.setItem('searchHistory', JSON.stringify(newHistory));
    } catch (error) {
      console.error('Failed to save search history:', error);
    }
  };

  const clearSearchHistory = () => {
    try {
      setSearchHistory([]);
      localStorage.removeItem('searchHistory');
    } catch (error) {
      console.error('Failed to clear search history:', error);
    }
  };

  const removeFromHistory = (query: string) => {
    try {
      const newHistory = searchHistory.filter((q) => q !== query);
      setSearchHistory(newHistory);
      localStorage.setItem('searchHistory', JSON.stringify(newHistory));
    } catch (error) {
      console.error('Failed to remove from search history:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch(value);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const clearSearch = () => {
    onChange('');
    setDebouncedQuery('');
    inputRef.current?.focus();
  };

  const showSuggestions = isOpen && debouncedQuery.length >= 2 && suggestions.length > 0;
  const showHistory = isOpen && !debouncedQuery && searchHistory.length > 0;
  const showDropdown = showSuggestions || showHistory;

  return (
    <div ref={containerRef} className={`relative flex-1 ${className}`}>
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          placeholder={placeholder}
          className="pl-9 pr-20"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <button
              onClick={clearSearch}
              className="p-1 hover:bg-muted rounded-md transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
          {isLoading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
          )}
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <div className="max-h-80 overflow-y-auto p-2">
            {/* Search History */}
            {showHistory && (
              <div className="mb-2">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    Recent Searches
                  </div>
                  <button
                    onClick={clearSearchHistory}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                {searchHistory.map((query) => (
                  <button
                    key={query}
                    onClick={() => handleSelectSuggestion(query)}
                    className="group flex w-full items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>{query}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromHistory(query);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded transition-all"
                      aria-label="Remove from history"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </button>
                ))}
              </div>
            )}

            {/* Autocomplete Suggestions */}
            {showSuggestions && (
              <div>
                <div className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground">
                  <TrendingUp className="h-3 w-3" />
                  Suggestions
                </div>
                {suggestions.map((suggestion: any, index: number) => (
                  <button
                    key={index}
                    onClick={() => handleSelectSuggestion(suggestion.text || suggestion)}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <SearchIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 text-left">
                      <div className="font-medium">{suggestion.text || suggestion}</div>
                      {suggestion.category && (
                        <div className="text-xs text-muted-foreground">
                          in {suggestion.category}
                        </div>
                      )}
                    </div>
                    {suggestion.count && (
                      <Badge variant="subtle" color="neutral" className="text-xs">
                        {suggestion.count}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
