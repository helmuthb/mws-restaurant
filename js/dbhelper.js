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
    this.restaurants = undefined;
    this.lastupdate = 0;
    this.reloading = false;
    this.db = new Promise((resolve, reject) => {
      const rq = indexedDB.open('restaurant-store', 1);
      rq.onsuccess = (event) => resolve(event.target.result);
      rq.onerror = (event) => reject(event.target.errorCode);
      rq.onupgradeneeded = (event) => {
        const db = event.target.result;
        this.restaurants = db.createObjectStore('restaurants', { keypath: 'id' });
        // created indexes
        this.restaurants.createIndex('neighborhood', 'neighborhood', { unique: false });
        this.restaurants.createIndex('cuisine', 'cuisine_type', { unique: false });
        this.restaurants.createIndex('cuisine_neighborhood', ['cuisine_type', 'neighborhood'], { unique: false, multiEntry: false });
      }
    });
  }

  /**
   * Cache lifetime.
   */
  get CACHE_LIFETIME() {
    // ten minutes
    return 1000 * 60 * 10;
  }

  /**
   * Database URL.
   * Change this to restaurants.json file location on your server.
   */
  get DATABASE_URL() {
    const port = 1337 // Change this to your server port
    return `http://localhost:${port}/restaurants`;
  }

  /**
   * Get a store - readonly or read-write
   *
   * @param {Database} db the resolved IDB
   * @param {Boolean} rw is writing required?
   * @return the store in a transaction, opened in the right mode
   */
  _getStore(db, rw = false) {
    const transaction = db.transaction(['restaurants'], rw ? 'readwrite': 'readonly');
    return transaction.objectStore('restaurants');
  }

  /**
   * Return a promise for when the store is cleared of data.
   */
  _clearStore() {
    return this.db.then(db => {
      const store = this._getStore(db, true);
      return new Promise((resolve, reject) => {
        store.clear();
        store.transaction.oncomplete = resolve;
      });
    });
  }

  /**
   * Returns a promise for when the store is filled with the JSON record.
   */
  _insertIntoStore(data) {
    return this.db.then(db => {
      const store = this._getStore(db, true);
      for (let r of data) {
        store.add(r, r.id);
      }
      return new Promise((resolve, reject) => {
        store.transaction.oncomplete = resolve;
        store.transaction.onerror = reject;
      })
    })
  }

  /**
   * Returns a promise for when the data has been initialized from the service.
   */
  _initializeFromService() {
    return this._clearStore()
      .then(() => fetch(this.DATABASE_URL))
      .then(response => response.json())
      .then(data => this._insertIntoStore(data));
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
    else {
      return new Promise((resolve, reject) => {
        if (this.lastupdate > Date.now() - this.CACHE_LIFETIME) {
          resolve();
        }
        else {
          this.reloading = true;
          this._initializeFromService()
            .then(() => {
              this.lastupdate = Date.now();
              this.reloading = false;
              resolve();
            });
        }
      });
    }
  }

  /**
   * Convert a cursor request into a promise which resolves to an array.
   */
  _cursorToArray(request) {
    return new Promise((resolve, reject) => {
      //
      let results = [];
      request.onsuccess = (event) => {
        const cursor = event.target.result;
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
      request.onerror = (event) => reject(event);
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
        const store = this._getStore(db, false);
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
        const store = this._getStore(db, false);
        const request = store.get(id);
        return new Promise((resolve, reject) => {
          request.onsuccess = () => { resolve(request.result); };
          request.onerror = reject;
        });
    });
  }

  /**
   * Fetch restaurants filtered by an index with proper error handling.
   * Returns a promise which resolves to the array of restaurants.
   * @param {String} index the name of the index to be used
   * @param {String} value the value of the indexed field used as filter
   */
  _fetchByIndex(index, value) {
    return this._updateFromService()
      .then(() => this.db)
      .then(db => {
        const store = this._getStore(db, false);
        const idx = store.index(index);
        const key = IDBKeyRange.only(value);
        const request = idx.openCursor(key);
        return this._cursorToArray(request);
      });
  }
  /**
   * Fetch restaurants by a cuisine type with proper error handling.
   * Returns a promise which resolves to the array of restaurants.
   */
  fetchRestaurantByCuisine(cuisine) {
    return this._fetchByIndex('cuisine', cuisine);
  }

  /**
   * Fetch restaurants by a neighborhood with proper error handling.
   * Returns a promise which resolves to the array of restaurants.
   */
  fetchRestaurantByNeighborhood(neighborhood) {
    return this._fetchByIndex('neighborhood', neighborhood);
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
    return this._fetchByIndex('cuisine_neighborhood', [cuisine, neighborhood]);
  }

  /**
   * Fetch all possible values of an index.
   * Returns a promise of an array of values.
   * @param {String} index Name of the index to be used
   */
  _getIndexRange(index) {
    return this._updateFromService()
      .then(() => this.db)
      .then(db => {
        const store = this._getStore(db, false);
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
  fetchCuisines(callback) {
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
