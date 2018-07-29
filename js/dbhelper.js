'use strict';

/**
 * Common database helper functions.
 */
class DBHelper {

  /**
   * DBHelper constructor.
   * This will also open a connection to IndexedDB.
   */
  constructor() {
    this.lastupdate = { restaurants: 0 };
    this.reloading = false;
    this.db = new Promise((resolve, reject) => {
      const rq = indexedDB.open('restaurant-store', 2);
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = (event) => reject(event.target.errorCode);
      rq.onupgradeneeded = (event) => {
        const db = rq.result;
        if (event.oldVersion < 1) {
          let restaurants = db.createObjectStore('restaurants', { keypath: 'id' });
          // create indexes
          restaurants.createIndex('neighborhood', 'neighborhood', { unique: false });
          restaurants.createIndex('cuisine', 'cuisine_type', { unique: false });
          restaurants.createIndex('cuisine_neighborhood', ['cuisine_type', 'neighborhood'], { unique: false, multiEntry: false });
        }
        if (event.oldVersion < 2) {
          let reviews = db.createObjectStore('reviews', { keypath: 'id' });
          // create index
          reviews.createIndex('restaurant', 'restaurant_id', { unique: false });
        }
      }
    });
  }

  /**
   * Cache lifetime.
   */
  get CACHE_LIFETIME() {
    // ten minutes
    // return 1000 * 60 * 10;
    return 10;
  }

  /**
   * Get the Database URL.
   * 
   * @param {String} entity name of the entity to be fetched
   */
  _getDbURL(entity) {
    const port = 1337 // Change this to your server port
    return `http://localhost:${port}/${entity}/`;
  }

  /**
   * Get a store - readonly or read-write
   *
   * @param {Database} db the resolved IDB
   * @param {String} storeName the name of the store
   * @param {Boolean} rw is writing required?
   * @return the store in a transaction, opened in the right mode
   */
  _getStore(db, storeName, rw = false) {
    const transaction = db.transaction([storeName], rw ? 'readwrite': 'readonly');
    return transaction.objectStore(storeName);
  }

  /**
   * Return a promise for when the specified store is cleared of data.
   * 
   * @param {String} storeName the name of the store to be cleared
   * @returns a promise which will be resolved once the store is cleared
   */
  _clearStore(storeName) {
    return this.db
      .then(db => {
        // delete store
        const store = this._getStore(db, storeName, true);
        return new Promise((resolve, reject) => {
          // only delete elements with id >= 0
          const keyrange = IDBKeyRange.lowerBound(0);
          store.delete(keyrange);
          store.transaction.oncomplete = () => resolve(db);
        });
    });
  }

  /**
   * Returns a promise for when the store is filled with the JSON record.
   * It first clears the database.
   * The promise resolves to true if data is found.
   * 
   * @param {Array} data the data to be filled into the store
   */
  _insertRestaurantsFromData(data) {
    // check if the data is defined
    if (data) {
      return this._clearStore('restaurants')
        .then(() => this._clearStore('reviews'))
        .then(() => this.db)
        .then(db => {
          const store = this._getStore(db, 'restaurants', true);
          for (let record of data) {
            store.add(record, record.id);
          }
          return new Promise((resolve, reject) => {
            store.transaction.oncomplete = () => resolve(true);
            store.transaction.onerror = reject;
          });
      });
    }
    else {
      return Promise.resolve(false);
    }
  }

  /**
   * Returns a promise for when the data has been initialized from the service.
   * If the fetch fails the old data will be reused.
   * The promise resolves to true of data has been updated, false otherwise.
   */
  _initializeRestaurantsFromService() {
    // create a promise for restaurants
    return fetch(this._getDbURL('restaurants'))
      .then(response => response.json(), error => {
        console.log('Error when fetching restaurants', error);
        // continue without error (no reloading)
        return undefined;
      })
      .then(data => this._insertRestaurantsFromData(data));
  }

  /**
   * Update the data if it is stale.
   * Return a promise when the data has been updated.
   */
  _updateFromService() {
    if (this.reloading) {
      // wait 10ms, then try again
      let self = this;
      return new Promise((resolve, reject) => {
        window.setTimeout(() => self._updateFromService().then(resolve), 10);
      });
    }
    if (this.lastupdate.restaurants > Date.now() - this.CACHE_LIFETIME) {
      return Promise.resolve();
    }
    this.reloading = true;
    return this._initializeRestaurantsFromService()
      .then(reloaded => {
        // we have reloaded all data - so let's clear it
        if (reloaded) {
          this.lastupdate = { restaurants: Date.now() };
        }
        this.reloading = false;
      });
  }

  /**
   * Delete all reviews in the store for a restaurant, except local ones.
   * @param {Number} restaurant_id the ID of the restaurant
   * @returns a promise which resolves afterwards
   */
  _clearReviews(restaurant_id) {
    let self = this;
    return this.db
      .then(db => new Promise((resolve, reject) => {
        const store = self._getStore(db, 'reviews', true);
        const idx = store.index('restaurant');
        const key = IDBKeyRange.only(restaurant_id);
        const request = idx.openCursor(key);
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            // next element ...
            if (cursor.value.id > 0) store.delete(cursor.value.id);
            cursor.continue();
          }
          else {
            // end of cursor
            resolve();
          }
        }
        request.onerror = reject;
      }));
  }

  /**
   * Store reviews from a JSON struct into the IndexedDB.
   * @param {Number} restaurant_id the ID of the restaurant
   * @param {Array} data an array of reviews
   * @returns a promise which resolves to true if data was stored
   */
  _insertReviewsFromData(restaurant_id, data) {
    // check if the data is defined
    if (data) {
      return this._clearReviews(restaurant_id)
        .then(() => this.db)
        .then(db => {
          const store = this._getStore(db, 'reviews', true);
          for (let record of data) {
            store.add(record, record.id);
          }
          return new Promise((resolve, reject) => {
            store.transaction.oncomplete = () => resolve(true);
            store.transaction.onerror = reject;
          });
      });
    }
    else {
      return Promise.resolve(false);
    }
  }

  /**
   * Returns a promise for when the data has been initialized from the service.
   * If the fetch fails the old data will be reused.
   * The promise resolves to true of data has been updated, false otherwise.
   * @param {Number} restaurant_id the ID of the restaurant
   */
  _initializeReviewsFromService(restaurant_id) {
    // create a promise for restaurants
    return fetch(this._getDbURL('reviews') + `?restaurant_id=${restaurant_id}`)
      .then(response => response.json(), error => {
        console.log('Error when fetching reviews', error);
        // continue without error (no reloading)
        return undefined;
      })
      .then(data => this._insertReviewsFromData(restaurant_id, data));
  }

  /**
   * Update the data if it is stale.
   * Return a promise when the data has been updated.
   */
  _updateReviewsFromService(restaurant_id) {
    if (this.reloading) {
      // wait 10ms, then try again
      let self = this;
      return new Promise((resolve, reject) => {
        window.setTimeout(() => self._updateReviewsFromService(restaurant_id).then(resolve), 10);
      });
    }
    if (restaurant_id in this.lastupdate &&
        this.lastupdate[restaurant_id] > Date.now() - this.CACHE_LIFETIME) {
      return Promise.resolve();
    }
    this.reloading = true;
    return this._initializeReviewsFromService(restaurant_id)
      .then(reloaded => {
        // we have reloaded all data - so let's clear it
        if (reloaded) {
          this.lastupdate[restaurant_id] = Date.now();
        }
        this.reloading = false;
      });
  }

  /**
   * Convert a cursor request into a promise which resolves to an array.
   */
  _cursorToArray(request) {
    return new Promise((resolve, reject) => {
      let results = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          if ('value' in cursor) {
            results.push(cursor.value);
          }
          else {
            results.push(cursor.key);
          }
          cursor.continue();
        }
        else {
          resolve(results);
        }
      };
      request.onerror = reject;
    });
  }

  /**
   * Fetch all restaurants.
   * Returns a promise which resolves to an array.
   */
  fetchRestaurants() {
    return this._updateFromService()
      .then(() => this.db)
      .then(db => {
        const store = this._getStore(db, 'restaurants', false);
        const request = store.openCursor();
        return this._cursorToArray(request);
      });
  }

  /**
   * Fetch a restaurant by its ID.
   * Returns a promise which resolves to the single restaurant.
   */
  fetchRestaurantById(id) {
    return this._updateFromService()
      .then(() => this.db)
      .then(db => {
        const store = this._getStore(db, 'restaurants', false);
        const request = store.get(id);
        return new Promise((resolve, reject) => {
          request.onsuccess = () => { resolve(request.result); };
          request.onerror = reject;
        });
    });
  }

  /**
   * Fetch items filtered by an index with proper error handling.
   * Returns a promise which resolves to the array of items.
   * 
   * @param {String} storeName the name of the store to be used
   * @param {String} index the name of the index to be used
   * @param {String} value the value of the indexed field used as filter
   */
  _fetchByIndex(storeName, index, value) {
    return this.db
      .then(db => {
        const store = this._getStore(db, storeName, false);
        const idx = store.index(index);
        const key = IDBKeyRange.only(value);
        const request = idx.openCursor(key);
        return this._cursorToArray(request);
      });
  }

  /**
   * Fetch restaurants filtered by an index
   * 
   * @param {String} index the name of the index to be used
   * @param {String} value the value of the indexed field used as filter
   */
  _fetchRestaurantsByIndex(index, value) {
    return this._updateFromService()
      .then(() => this._fetchByIndex('restaurants', index, value));
  }

  /**
   * Fetch restaurants by a cuisine type with proper error handling.
   * Returns a promise which resolves to the array of restaurants.
   */
  fetchRestaurantByCuisine(cuisine) {
    return this._fetchRestaurantsByIndex('cuisine', cuisine);
  }

  /**
   * Fetch restaurants by a neighborhood with proper error handling.
   * Returns a promise which resolves to the array of restaurants.
   */
  fetchRestaurantByNeighborhood(neighborhood) {
    return this._fetchRestaurantsByIndex('neighborhood', neighborhood);
  }

  /**
   * Fetch restaurants by a cuisine and a neighborhood with proper error handling.
   * Returns a promise which resolves to the array of restaurants.
   */
  fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood) {
    if (cuisine === 'all' && neighborhood === 'all') {
      return this.fetchRestaurants();
    }
    if (neighborhood === 'all') {
      return this.fetchRestaurantByCuisine(cuisine);
    }
    if (cuisine === 'all') {
      return this.fetchRestaurantByNeighborhood(neighborhood);
    }
    return this._fetchRestaurantsByIndex('cuisine_neighborhood', [cuisine, neighborhood]);
  }

  /**
   * Fetch reviews for a specific restaurant.
   * Returns a promise which resolves to the array of reviews.
   * 
   * @param {Number} restaurant_id the ID value of the restaurant
   */
  fetchReviews(restaurant_id) {
    return this._updateReviewsFromService(restaurant_id)
      .then(() => this._fetchByIndex('reviews', 'restaurant', restaurant_id));
  }

  /**
   * Toggle the favorite status of a restaurant
   * @param {Number} restaurant_id the ID of the restaurant
   * @returns a promise resolving to the new favorite status of the restaurant
   */
  toggleFavorite(restaurant_id) {
    return this.db
      .then(db => {
        const store = this._getStore(db, 'restaurants', true);
        const rq = store.get(restaurant_id);
        return new Promise((resolve, reject) => {
          rq.onsuccess = () => {
            const restaurant = rq.result;
            restaurant.is_favorite = !restaurant.is_favorite;
            store.put(restaurant, restaurant_id);
            store.transaction.oncomplete = () => {
              resolve(restaurant.is_favorite);
            };
            store.transaction.onerror = reject;
          }
        })
        .then(favorite => {
          // store in the API service
          const url = this._getDbURL('restaurants') +
                      `${restaurant_id}?is_favorite=${favorite}`;
          return fetch(url, { method: 'PUT'}).then(() => favorite);
        })
      })
      .catch(error => {
        console.log('Error when updating favorite status', error);
        return undefined;
      });
  }

  /**
   * Add a review to a restaurant
   * 
   * @param {Number} restaurant_id restaurant ID value
   * @param {String} name name of the reviewer
   * @param {Number} rating rating from 1 to 5
   * @param {String} comments review comments
   */
  addReview(restaurant_id, name, rating, comments) {
    const review = { restaurant_id, name, rating, comments};
    console.log(review);
    fetch(this._getDbURL('reviews'),
          { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(review) })
      .then(res => {
        if (res.ok) {
          // All OK, the review was posted to the server
          console.log(res);
          return res.json();
        }
      })
      .then(json => {
        console.log(json);
      });
    // TODO
  }

  /**
   * Fetch all possible values of an index. This only exists for restaurants.
   * Returns a promise of an array of values.
   * @param {String} index name of the index to be used
   */
  _getIndexRange(index) {
    return this._updateFromService()
      .then(() => this.db)
      .then(db => {
        const store = this._getStore(db, 'restaurants', false);
        const idx = store.index(index);
        const request = idx.openKeyCursor(undefined, 'nextunique');
        return this._cursorToArray(request);
      });
  }

  /**
   * Fetch all neighborhoods with proper error handling.
   * Returns a promise of an array of neighborhoods.
   */
  fetchNeighborhoods() {
    return this._getIndexRange('neighborhood');
  }

  /**
   * Fetch all cuisines with proper error handling.
   * Returns a promise of an array of cuisines.
   */
  fetchCuisines() {
    return this._getIndexRange('cuisine');
  }

  /**
   * Restaurant page URL.
   */
  urlForRestaurant(restaurant) {
    return (`./restaurant.html?id=${restaurant.id}`);
  }

  /**
   * Restaurant image URL.
   */
  imageUrlForRestaurant(restaurant, size) {
    let photograph = restaurant.photograph;
    if (photograph === undefined) {
      photograph = restaurant.id;
    }
    if (!size) {
      return (`/img/${photograph}.jpg`);
    }
    else {
      return (`/img/${size}w-${photograph}.jpg`);
    }
  }

  /**
   * Map marker for a restaurant.
   */
  mapMarkerForRestaurant(restaurant, map) {
    const marker = new google.maps.Marker({
      position: restaurant.latlng,
      title: restaurant.name,
      url: this.urlForRestaurant(restaurant),
      map: map,
      animation: google.maps.Animation.DROP}
    );
    return marker;
  }
}
