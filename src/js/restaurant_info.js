'use strict';

let restaurant;
let map;
let dbHelper = new DBHelper();

/**
 * Initialize Google map, called from HTML.
 */
window.initMap = () => {
  fetchRestaurantFromURL((error, restaurant) => {
    if (error) { // Got an error!
      console.error(error);
    } else {
      self.map = new google.maps.Map(document.getElementById('map'), {
        zoom: 16,
        center: restaurant.latlng,
        scrollwheel: false
      });
      window.setTimeout(() => {
        let iframes = document.getElementsByTagName('iframe');
        for (let i=0; i<iframes.length; i++) {
          iframes[i].title = 'Google Maps IFrame';
        }    
      });
      fillBreadcrumb();
      dbHelper.mapMarkerForRestaurant(self.restaurant, self.map);
    }
  });
};

/**
 * Get current restaurant from page URL.
 */
let fetchRestaurantFromURL = (callback) => {
  if (self.restaurant) { // restaurant already fetched!
    callback(null, self.restaurant)
    return;
  }
  const id = getParameterByName('id');
  if (!id) { // no id found in URL
    error = 'No restaurant id in URL'
    callback(error, null);
  } else {
    dbHelper.fetchRestaurantById(parseInt(id))
    .then(restaurant => {
      self.restaurant = restaurant;
      fillRestaurantHTML();
      dbHelper.fetchReviews(restaurant.id)
      .then(review => {
        fillReviewsHTML(review);
        callback(null, restaurant);
      })
    })
    .catch((error) => {
      console.error(error);
    });
  }
};

let restaurantName = (restaurant = self.restaurant) => {
  const favorite = restaurant.is_favorite ? '♥' : '♡';
  return restaurant.name + ' ' + favorite;
}

/**
 * Create restaurant HTML and add it to the webpage
 */
let fillRestaurantHTML = (restaurant = self.restaurant) => {
  const name = document.getElementById('restaurant-name');
  name.innerHTML = restaurantName(restaurant);
  name.addEventListener('click', () => toggleFavorite());

  const address = document.getElementById('restaurant-address');
  address.innerHTML = restaurant.address;

  const image = document.getElementById('restaurant-img');
  image.className = 'restaurant-img'
  var fullUrl = dbHelper.imageUrlForRestaurant(restaurant);
  var srcset = dbHelper.imageUrlForRestaurant(restaurant, 200) + " 200w, " +
               dbHelper.imageUrlForRestaurant(restaurant, 400) + " 400w, " +
               fullUrl + " 800w";
  image.setAttribute("srcset", srcset);
  image.src = fullUrl;
  image.alt = restaurant.name;

  const cuisine = document.getElementById('restaurant-cuisine');
  cuisine.innerHTML = restaurant.cuisine_type;

  // fill operating hours
  if (restaurant.operating_hours) {
    fillRestaurantHoursHTML();
  }
};

/**
 * Toggle the favorite-status of a restaurant.
 * @param {Restaurant} restaurant object to be toggled as a favorite
 */
let toggleFavorite = (restaurant = self.restaurant) => {
  dbHelper.toggleFavorite(restaurant.id)
    .then(favorite => {
      if (typeof favorite == 'boolean') {
        const name = document.getElementById('restaurant-name');
        restaurant.is_favorite = favorite;
        name.innerHTML = restaurantName(restaurant);
      }
    });
}

/**
 * Create restaurant operating hours HTML table and add it to the webpage.
 */
let fillRestaurantHoursHTML = (operatingHours = self.restaurant.operating_hours) => {
  const hours = document.getElementById('restaurant-hours');
  for (let key in operatingHours) {
    const row = document.createElement('tr');

    const day = document.createElement('td');
    day.innerHTML = key;
    row.appendChild(day);

    const time = document.createElement('td');
    time.innerHTML = operatingHours[key];
    row.appendChild(time);

    hours.appendChild(row);
  }
};

/**
 * Create all reviews HTML and add them to the webpage.
 */
let fillReviewsHTML = (reviews) => {
  const container = document.getElementById('reviews-container');
  const title = document.createElement('h2');
  title.innerHTML = 'Reviews';
  container.appendChild(title);

  if (!reviews) {
    const noReviews = document.createElement('p');
    noReviews.innerHTML = 'No reviews yet!';
    container.appendChild(noReviews);
    return;
  }
  const ul = document.getElementById('reviews-list');
  reviews.forEach(review => {
    ul.appendChild(createReviewHTML(review));
  });
  container.appendChild(ul);

  const formTitle = document.createElement('h2');
  formTitle.innerHTML = 'Add Your Review';
  container.appendChild(formTitle);
  const form = document.getElementById('review-form');
  form.onsubmit = (e) => {
    e.preventDefault();
    const reviewer = document.getElementById('reviewer-name');
    const rating = document.getElementById('reviewer-rating');
    const comment = document.getElementById('reviewer-comment');
    dbHelper.addReview(self.restaurant.id, reviewer.value, rating.value, comment.value)
      .then(review => {
        // show the new review
        ul.appendChild(createReviewHTML(review));
        // clear form
        reviewer.value = '';
        rating.value = 1;
        comment.value = '';
      });
    return false;
  };
  container.appendChild(form);
};

/**
 * Convert a UNIX epoch value to a readable date string.
 * Inspired by https://stackoverflow.com/a/6078873/813725
 * 
 * @param {Number} timestamp number of milliseconds since 1. 1. 1970, or a string value
 */
let formattedDate = (timestamp) => {
  let date;
  if (typeof timestamp == 'undefined') {
    date = new Date();
  }
  if (typeof timestamp == 'string') {
    date = new Date(timestamp);
  }
  if (typeof timestamp == 'number') {
    date = new Date(timestamp);
  }
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return date.getDate() + ' ' + months[date.getMonth()] + ' ' + date.getFullYear();
}

/**
 * Create review HTML and add it to the webpage.
 */
let createReviewHTML = (review) => {
  const li = document.createElement('li');
  const name = document.createElement('p');
  name.innerHTML = review.name;
  li.appendChild(name);

  const date = document.createElement('p');
  
  date.innerHTML = formattedDate(review.updateAt || review.createdAt);
  li.appendChild(date);

  const rating = document.createElement('p');
  rating.innerHTML = `Rating: ${review.rating}`;
  li.appendChild(rating);

  const comments = document.createElement('p');
  comments.innerHTML = review.comments;
  li.appendChild(comments);

  return li;
};

/**
 * Add restaurant name to the breadcrumb navigation menu
 */
let fillBreadcrumb = (restaurant=self.restaurant) => {
  const breadcrumb = document.getElementById('breadcrumb');
  const li = document.createElement('li');
  li.innerHTML = restaurant.name;
  breadcrumb.appendChild(li);
};

/**
 * Get a parameter by name from page URL.
 */
let getParameterByName = (name, url) => {
  if (!url)
    url = window.location.href;
  name = name.replace(/[\[\]]/g, '\\$&');
  const regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`),
    results = regex.exec(url);
  if (!results)
    return null;
  if (!results[2])
    return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
};

let getReviews = (restaurant_id) => {
  //
}