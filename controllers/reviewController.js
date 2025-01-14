const { Review, Users, Restroom, Comment } = require('../models');
const { getOrCreateRestroom } = require('../utils/getOrCreateRestroom');
const dotenv = require('dotenv');
dotenv.config();
const googleMapsAPIKey = process.env.GOOGLE_PLACES_API_KEY;

exports.createReview = async (req, res) => {
  console.log('req.body:', req.body);
  try {
    const { placeId, rating, comment } = req.body;
    const userId = req.user.id;
    const customerOnlyUse = req.body.rating.customer_only_use === 'on';

    if (!rating.cleanliness || !rating.accessibility || !rating.privacy_security || !rating.convenience) {
      return res.status(400).json({ message: 'All rating fields are required.' });
    }

    const restroom = await getOrCreateRestroom(placeId);

    const existingReview = await checkExistingReview(restroom.id, userId);
    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this restroom.' });
    }

    const newReview = await createNewReview(restroom.id, userId, rating, customerOnlyUse, comment);
    // Redirect to the restroom review page after creating the review
    return res.redirect(`/reviews/${restroom.id}`);
  } catch (error) {
    console.error('Error creating review:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

const checkExistingReview = async (restroomId, userId) => {
  return await Review.findOne({
    where: {
      restroom_id: restroomId,
      user_id: userId
    }
  });
};

const createNewReview = async (restroomId, userId, rating, customerOnlyUse, comment) => {
  return await Review.create({
    restroom_id: restroomId,
    user_id: userId,
    cleanliness: rating.cleanliness,
    accessibility: rating.accessibility,
    privacy_security: rating.privacy_security,
    convenience: rating.convenience,
    customer_only_use: customerOnlyUse ? true : false,
    content: comment,
  });
};

const renderReviewResponse = (res, restroom, reviews, user, userHasReviewed, poopEmojis) => {
  const API_KEY = googleMapsAPIKey
  res.render('reviews/list', { searchResult: restroom, reviews, user, userHasReviewed, poopEmojis, API_KEY });
};

const calculateAverageRating = (reviews) => {
  const total = reviews.reduce((acc, review) => acc + (review.cleanliness + review.accessibility + review.privacy_security + review.convenience) / 4, 0);
  return total / reviews.length;
};

const convertToPoopEmojis = (rating) => {
  return '💩'.repeat(Math.round(rating));
};

exports.getReviewsAndInfoById = async (req, res) => {
  try {
    const { id } = req.params;

    const restroom = await fetchRestroomById(id);
    if (!restroom) {
      return res.status(404).json({ message: 'Restroom not found' });
    }

    const reviews = await fetchReviewsByRestroomId(id);
    const userHasReviewed = determineIfUserHasReviewed(reviews, req.user);

    // Calculate average rating and convert to poop emojis
    const averageRating = calculateAverageRating(reviews);
    const poopEmojis = convertToPoopEmojis(averageRating);

    // Fetch comments for each review and convert ratings to poop emojis
    for (let review of reviews) {
      review.comments = await fetchCommentsByReviewId(review.id);
      review.cleanliness = convertToPoopEmojis(review.cleanliness);
      review.accessibility = convertToPoopEmojis(review.accessibility);
      review.privacy_security = convertToPoopEmojis(review.privacy_security);
      review.convenience = convertToPoopEmojis(review.convenience);
    }

    return renderReviewResponse(res, restroom, reviews, req.user, userHasReviewed, poopEmojis);
  } catch (error) {
    console.error('Error fetching reviews:', error.message, error.stack);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const fetchRestroomById = async (id) => {
  return await Restroom.findByPk(id);
};

const fetchReviewsByRestroomId = async (restroomId) => {
  return await Review.findAll({
    where: { restroom_id: restroomId },
    include: [{ model: Users, attributes: ['username'] }]
  });
};

const fetchCommentsByReviewId = async (reviewId) => {
  return await Comment.findAll({
    where: { review_id: reviewId },
    include: [{ model: Users, attributes: ['username'] }]
  });
};

const determineIfUserHasReviewed = (reviews, user) => {
  if (user) {
    return reviews.some(review => review.user_id === user.id);
  }
  return false;
};

exports.deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await findReviewById(reviewId);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    if (!isUserAuthorizedToDelete(review, req.user)) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    await deleteReviewById(reviewId);
    return res.redirect('back'); // Redirect to the previous page
  } catch (error) {
    console.error('Error deleting review:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

const findReviewById = async (reviewId) => {
  return await Review.findByPk(reviewId);
};

const isUserAuthorizedToDelete = (review, user) => {
  return review.user_id === user.id;
};

const deleteReviewById = async (reviewId) => {
  const review = await Review.findByPk(reviewId);
  return await review.destroy();
};