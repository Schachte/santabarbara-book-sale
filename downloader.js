// Import necessary modules
const fs = require('fs').promises;
const fssync = require('fs');
const path = require('path');
const axios = require('axios');
const { chromium } = require('playwright');

// Load book list from JS module
const bookList = require('./books.js').default;
const coversDir = path.join(__dirname, 'covers');

// Function to download an image
async function downloadImage(url, filepath) {
  try {
    const response = await axios({
      url,
      method: 'GET',
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    const writer = fssync.createWriteStream(filepath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', (err) => {
        console.error(`Error writing file ${filepath}:`, err);
        // Attempt to clean up the partially written file
        fssync.unlink(filepath, () => reject(err));
      });
    });
  } catch (error) {
    console.error(`Failed to start download for ${url}:`, error.message);
    throw error;
  }
}

// Function to check if a file exists and has content
async function fileExistsWithContent(filepath) {
  try {
    if (!fssync.existsSync(filepath)) return false;
    const stats = await fs.stat(filepath);
    return stats.size > 0; // Make sure file has content
  } catch (error) {
    return false;
  }
}

// Main function to process books
async function processBooks() {
  // Ensure the 'covers' directory exists
  try {
    if (!fssync.existsSync(coversDir)) {
      await fs.mkdir(coversDir, { recursive: true });
      console.log(`Created directory: ${coversDir}`);
    } else {
      console.log(`Directory already exists: ${coversDir}`);
    }
  } catch (error) {
    console.error(`Error creating directory ${coversDir}:`, error);
    return;
  }

  // Launch browser once for all searches
  const browser = await chromium.launch({ 
    headless: true
  });
  
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });
  
  const page = await context.newPage();

  // Track which books have been processed successfully
  const failedBooks = [];

  try {
    // Process all books
    for (const book of bookList) {
      const { id, title, author } = book;
      
      // Check if the book cover already exists
      const possibleExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      let fileExists = false;
      
      for (const ext of possibleExtensions) {
        const filePath = path.join(coversDir, `${id}${ext}`);
        if (await fileExistsWithContent(filePath)) {
          console.log(`\nSkipping "${title}" - cover file already exists at ${filePath}`);
          fileExists = true;
          break;
        }
      }
      
      if (fileExists) continue;
      
      console.log(`\nProcessing: "${title}" by ${author}`);
      
      let success = false;
      
      // Try Amazon search first - more reliable
      try {
        const amazonQuery = `${title} ${author} book`;
        const amazonUrl = `https://www.amazon.com/s?k=${encodeURIComponent(amazonQuery)}`;
        
        console.log(`Searching Amazon: ${amazonUrl}`);
        await page.goto(amazonUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait for search results
        await page.waitForSelector('.s-result-item', { timeout: 5000 }).catch(() => {
          console.log('Timed out waiting for Amazon search results, continuing anyway');
        });
        
        // Find the first book image
        const bookImage = await page.$('.s-image');
        
        if (bookImage) {
          const imageUrl = await bookImage.getAttribute('src');
          if (imageUrl && imageUrl.startsWith('http')) {
            console.log(`Found Amazon image URL: ${imageUrl}`);
            
            // Try to determine a file extension
            let extension = '.jpg'; // Default extension
            try {
              const urlPath = new URL(imageUrl).pathname;
              const ext = path.extname(urlPath);
              if (ext && ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext.toLowerCase())) {
                extension = ext;
              }
            } catch (e) {
              console.warn(`Could not determine extension for URL ${imageUrl}, using default .jpg`);
            }
            
            const filename = `${id}${extension}`;
            const filepath = path.join(coversDir, filename);
            
            console.log(`Downloading to: ${filepath}`);
            await downloadImage(imageUrl, filepath);
            console.log(`Successfully downloaded cover for "${title}"`);
            
            success = true;
            continue; // Skip to next book if we found an image
          }
        }
        
        console.log('No suitable Amazon image found, trying direct book cover search');
      } catch (amazonError) {
        console.error(`Amazon search error for "${title}": ${amazonError.message}`);
        console.log('Falling back to direct book cover search');
      }
      
      // If Amazon failed, try direct Google search for book cover
      try {
        const googleQuery = `${title} ${author} book cover`;
        const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(googleQuery)}&tbm=isch`;
        
        console.log(`Searching Google Images: ${googleUrl}`);
        await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait for images to load
        await page.waitForSelector('img', { timeout: 5000 }).catch(() => {
          console.log('Timed out waiting for images, continuing anyway');
        });
        
        // Find and extract image URLs from the page
        const imageUrls = await page.evaluate(() => {
          const urls = [];
          
          // Get all image elements
          const images = document.querySelectorAll('img');
          
          // Process each image
          images.forEach(img => {
            // Skip tiny images and Google icons
            if (img.width < 60 || img.height < 60) return;
            if (img.src && (img.src.includes('google') || img.src.includes('gstatic'))) return;
            
            // Check src and data attributes
            ['src', 'data-src', 'data-iurl'].forEach(attr => {
              const value = img.getAttribute(attr);
              if (value && value.startsWith('http')) {
                urls.push(value);
              }
            });
          });
          
          // Also try to find image URLs in the page source
          const html = document.documentElement.outerHTML;
          const imgRegex = /"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|gif|webp))"/gi;
          const matches = [...html.matchAll(imgRegex)];
          
          matches.forEach(match => {
            if (match[1] && !match[1].includes('google') && !match[1].includes('gstatic')) {
              urls.push(match[1]);
            }
          });
          
          return urls;
        });
        
        if (imageUrls && imageUrls.length > 0) {
          console.log(`Found ${imageUrls.length} potential image URLs`);
          const imageUrl = imageUrls[0]; // Use the first image
          
          // Try to determine a file extension
          let extension = '.jpg'; // Default extension
          try {
            const urlPath = new URL(imageUrl).pathname;
            const ext = path.extname(urlPath);
            if (ext && ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext.toLowerCase())) {
              extension = ext;
            }
          } catch (e) {
            console.warn(`Could not determine extension for URL ${imageUrl}, using default .jpg`);
          }
          
          const filename = `${id}${extension}`;
          const filepath = path.join(coversDir, filename);
          
          console.log(`Downloading to: ${filepath}`);
          await downloadImage(imageUrl, filepath);
          console.log(`Successfully downloaded cover for "${title}"`);
          success = true;
        } else {
          console.warn(`No valid image URL found for "${title}"`);
          failedBooks.push(book);
        }
      } catch (error) {
        console.error(`Failed to process "${title}":`, error.message);
        failedBooks.push(book);
      }
      
      if (!success) {
        console.log(`Failed to download cover for "${title}" - will retry later`);
      }
      
      // Add a delay to be polite to servers
      const delayMs = 3000 + Math.random() * 2000; // 3-5 seconds
      console.log(`Waiting for ${Math.round(delayMs / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    
    // Retry failed books
    if (failedBooks.length > 0) {
      console.log(`\n\nRetrying ${failedBooks.length} failed books...`);
      
      // Create a new context with different user agent
      const retryContext = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.51 Safari/537.36',
        viewport: { width: 1366, height: 768 }
      });
      
      const retryPage = await retryContext.newPage();
      
      for (const book of failedBooks) {
        const { id, title, author } = book;
        console.log(`\nRetrying: "${title}" by ${author}`);
        
        // Direct Google search first this time
        try {
          // Directly use a different image search service
          const bingQuery = `${title} ${author} book cover`;
          const bingUrl = `https://www.bing.com/images/search?q=${encodeURIComponent(bingQuery)}&form=HDRSC2&first=1`;
          
          console.log(`Searching Bing Images: ${bingUrl}`);
          await retryPage.goto(bingUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          await retryPage.waitForSelector('.mimg', { timeout: 5000 }).catch(() => {
            console.log('Timed out waiting for Bing images, continuing anyway');
          });
          
          // Find image elements
          const imageElements = await retryPage.$$('.mimg');
          
          if (imageElements.length > 0) {
            // Get the first image URL
            const imageUrl = await imageElements[0].getAttribute('src');
            
            if (imageUrl && imageUrl.startsWith('http')) {
              console.log(`Found Bing image URL: ${imageUrl}`);
              
              const filename = `${id}.jpg`;
              const filepath = path.join(coversDir, filename);
              
              console.log(`Downloading to: ${filepath}`);
              await downloadImage(imageUrl, filepath);
              console.log(`Successfully downloaded cover for "${title}" on retry`);
              continue;
            }
          }
          
          console.log(`Still couldn't find cover for "${title}" using Bing`);
        } catch (error) {
          console.error(`Error during retry for "${title}":`, error.message);
        }
        
        // If Bing search fails, try OpenLibrary as a last resort
        try {
          const openLibraryQuery = `${title} ${author}`.replace(/\s+/g, '+');
          const openLibraryUrl = `https://openlibrary.org/search?q=${openLibraryQuery}&mode=everything`;
          
          console.log(`Searching OpenLibrary: ${openLibraryUrl}`);
          await retryPage.goto(openLibraryUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          // Wait for search results
          await retryPage.waitForSelector('.searchResultItem', { timeout: 5000 }).catch(() => {
            console.log('Timed out waiting for OpenLibrary results, continuing anyway');
          });
          
          // Find the first book cover
          const coverElement = await retryPage.$('.cover');
          
          if (coverElement) {
            const imgElement = await coverElement.$('img');
            if (imgElement) {
              let imageUrl = await imgElement.getAttribute('src');
              
              // OpenLibrary sometimes uses relative URLs or small thumbnails
              // Convert to absolute URL and get larger version if needed
              if (imageUrl) {
                if (imageUrl.startsWith('/')) {
                  imageUrl = `https://openlibrary.org${imageUrl}`;
                }
                
                // Try to get larger image version
                imageUrl = imageUrl.replace('-S.jpg', '-L.jpg').replace('-M.jpg', '-L.jpg');
                
                console.log(`Found OpenLibrary image URL: ${imageUrl}`);
                
                const filename = `${id}.jpg`;
                const filepath = path.join(coversDir, filename);
                
                console.log(`Downloading to: ${filepath}`);
                await downloadImage(imageUrl, filepath);
                console.log(`Successfully downloaded cover for "${title}" from OpenLibrary`);
              }
            }
          } else {
            console.log(`Could not find cover for "${title}" on OpenLibrary either`);
          }
        } catch (error) {
          console.error(`OpenLibrary error for "${title}":`, error.message);
        }
        
        // Add a delay between retries
        const delayMs = 3000 + Math.random() * 2000;
        console.log(`Waiting for ${Math.round(delayMs / 1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      await retryContext.close();
    }
  } finally {
    // Close browser
    await browser.close();
  }
  
  console.log("\nFinished processing all books.");
  
  // Report any books that still failed
  const stillFailed = [];
  for (const book of bookList) {
    const { id, title } = book;
    let found = false;
    
    for (const ext of ['.jpg', '.jpeg', '.png', '.gif', '.webp']) {
      const filePath = path.join(coversDir, `${id}${ext}`);
      if (await fileExistsWithContent(filePath)) {
        found = true;
        break;
      }
    }
    
    if (!found) {
      stillFailed.push(title);
    }
  }
  
  if (stillFailed.length > 0) {
    console.log(`\nFailed to download covers for ${stillFailed.length} books:`);
    stillFailed.forEach(title => console.log(`- ${title}`));
  } else {
    console.log(`\nSuccessfully downloaded all book covers!`);
  }
}

// Run the main function
processBooks().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});