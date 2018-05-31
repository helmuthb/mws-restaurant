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
    this._dbPromise = new Promise((resolve, reject) => {
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
   * Get promise for transaction
   */
  _transaction(mode = 'readonly') {
    return this._dbPromise.then((db) => {
      // create new transaction
      return db.transaction(["restaurants"], mode);
    });
  }

  /**
   * Get promise for store (read-only)
   */
  _store() {
    return this._transaction().then((transaction) => {
      return transaction.objectStore("restaurants");
    });
  }

  /**
   * Get a store promise (read-only) with up-to-date data.
   * Refresh if the last fetch from the service was long ago.
   */
  get store() {
    if (this.lastupdate > Date.now() - this.CACHE_LIFETIME) {
      return this._store();
    }
    return fetch(this.DATABASE_URL)
      .then((response) => {
        // parse as JSON
        return response.json();
      })
      .then((data) => {
        // First delete existing data in IndexedDB
        // then insert new data
        return this._transaction('readwrite').then((transaction) => {
          let store = transaction.objectStore('restaurants');
          // clear store
          store.clear().onsuccess = (event) => {
            // now add all restaurant elements
            for (let r of data) {
              store.add(r, r.id);
            }
          };
          // now return a promise which resolves to the DB
          // once the transaction is finished
          return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
              // set last update time
              this.lastupdate = Date.now();
              resolve(this._store());
            };
            transaction.onerror = (event) => reject(event);
          });
        });
      })
      .catch((error) => {
        // offline - so we send the last data as before.
        return this._store();
      });
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
    return this.store.then((store) => {
      // return restaurants
      const request = store.openCursor();
      return this._cursorToArray(request);
    });
  }

  /**
   * Fetch a restaurant by its ID.
   * Returns a promise which resolves to the single restaurant.
   */
  fetchRestaurantById(id) {
    return this.store.then((store) => {
      return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject(event);
      });
    });
  }

  /**
   * Fetch restaurants by a cuisine type with proper error handling.
   * Returns a promise which resolves to the array of restaurants.
   */
  fetchRestaurantByCuisine(cuisine) {
    return this.store.then((store) => {
      const idx = store.index('cuisine');
      const key = IDBKeyRange.only(cuisine);
      const request = idx.openCursor(key);
      return this._cursorToArray(request);
    });
  }

  /**
   * Fetch restaurants by a neighborhood with proper error handling.
   * Returns a promise which resolves to the array of restaurants.
   */
  fetchRestaurantByNeighborhood(neighborhood) {
    return this.store.then((store) => {
      const idx = store.index('neighborhood');
      const key = IDBKeyRange.only(neighborhood);
      const request = idx.openCursor(key);
      return this._cursorToArray(request);
    });
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
    return this.store.then((store) => {
      const idx = store.index('cuisine_neighborhood');
      const key = IDBKeyRange.only([cuisine, neighborhood]);
      const request = idx.openCursor(key);
      return this._cursorToArray(request);
    });
  }

  /**
   * Fetch all neighborhoods with proper error handling.
   * Returns a promise of an array of neighborhoods.
   */
  fetchNeighborhoods(callback) {
    return this.store.then((store) => {
      const idx = store.index('neighborhood');
      const request = idx.openKeyCursor(undefined, 'nextunique');
      return this._cursorToArray(request);
    });
  }

  /**
   * Fetch all cuisines with proper error handling.
   * Returns a promise of an array of cuisines.
   */
  fetchCuisines(callback) {
    return this.store.then((store) => {
      const idx = store.index('cuisine');
      const request = idx.openKeyCursor(undefined, 'nextunique');
      return this._cursorToArray(request);
    });
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
