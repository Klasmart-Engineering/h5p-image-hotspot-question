/*global H5P*/
H5P.ImageHotspotQuestion = (function ($, Question) {

  /**
   * Initialize module.
   *
   * @class H5P.ImageHotspotQuestion
   * @extends H5P.Question
   * @param {Object} params Behavior settings
   * @param {number} id Content identification
   * @param {Object} contentData Task specific content data
   */
  function ImageHotspotQuestion(params, id, contentData) {
    const self = this;

    const defaults = {
      imageHotspotQuestion: {
        backgroundImageSettings: {
          backgroundImage: {
            path: ''
          }
        },
        hotspotSettings: {
          hotspot: [],
          showFeedbackAsPopup: true,
          l10n: {
            retryText: 'Retry',
            closeText: 'Close',
            correctText: 'Correct!'
          }
        }
      },
      behaviour: {
        enableRetry: true,
        enableSolutionsButton: false
      },
      scoreBarLabel: 'You got :num out of :total points',
      a11yRetry: 'Retry the task. Reset all responses and start the task over again.',
    };

    // Inheritance
    Question.call(self, 'image-hotspot-question');

    /**
     * Keeps track of content id.
     * @type {number}
     */
    this.contentId = id;

    /**
     * Extra data.
     * @type {object}
     */
    this.contentData = contentData;

    /**
     * Keeps track of current score.
     * @type {number}
     */
    this.score = 0;

    /**
     * Keeps track of max score.
     * @type {number}
     */
    this.maxScore = 1;

    /**
     * State for not accepting clicks.
     * @type {boolean}
     */
    this.disabled = false;

    /**
     * State for answer given.
     * @type {boolean}
     */
    this.answerGiven = false;

    /**
     * Keeps track of parameters
     */
    this.params = $.extend(true, {}, defaults, params);

    /**
     * Easier access to image settings.
     * H5P semantics doesn't treat Arrays with one element as arrays with one element
     */
    this.imageSettings = this.params.imageHotspotQuestion.backgroundImageSettings;

    /**
     * Easier access to hotspot settings.
     */
    this.hotspotSettings = this.params.imageHotspotQuestion.hotspotSettings;

    /**
     * Hotspot feedback object. Contains hotspot feedback specific parameters.
     * @type {Object}
     */
    this.hotspotFeedback = {
      hotspotChosen: false
    };

    /**
     * Keeps track of all hotspots in an array.
     * @type {Array}
     */
    this.$hotspots = [];

    /**
     * Keeps track of the content data. Specifically the previous state.
     * @type {Object}
     */
    this.contentData = contentData;
    if (contentData !== undefined && contentData.previousState !== undefined) {
      this.previousState = contentData.previousState;
    }

    // Register resize listener with h5p
    this.on('resize', this.resize);
  }

  // Inheritance
  ImageHotspotQuestion.prototype = Object.create(Question.prototype);
  ImageHotspotQuestion.prototype.constructor = ImageHotspotQuestion;

  /**
   * Registers this question types DOM elements before they are attached.
   * Called from H5P.Question.
   */
  ImageHotspotQuestion.prototype.registerDomElements = function () {
    // Register task introduction text
    if (this.hotspotSettings.taskDescription) {
      this.setIntroduction(this.hotspotSettings.taskDescription);
    }

    // Register task content area
    this.setContent(this.createContent());

    // Register retry button
    this.createRetryButton();
  };

  /**
   * Create wrapper and main content for question.
   * @returns {H5P.jQuery} Wrapper
   */
  ImageHotspotQuestion.prototype.createContent = function () {
    const self = this;

    this.$wrapper = $('<div>', {
      'class': 'image-hotspot-question'
    });
    this.$wrapper.ready(function () {
      const imageHeight = self.$wrapper.width() * (self.imageSettings.height / self.imageSettings.width);
      self.$wrapper.css('height', imageHeight + 'px');
    });

    if (this.imageSettings && this.imageSettings.path) {
      this.$imageWrapper = $('<div>', {
        'class': 'image-wrapper'
      }).appendTo(this.$wrapper);

      // Image loader screen
      const $loader = $('<div>', {
        'class': 'image-loader'
      }).appendTo(this.$imageWrapper)
        .addClass('loading');

      this.$img = $('<img>', {
        'class': 'hotspot-image',
        'src': (this.imageSettings.path && this.imageSettings.path !== '') ? H5P.getPath(this.imageSettings.path, this.contentId) : ''
      });

      // Resize image once loaded
      this.$img.on('load', function () {
        $loader.replaceWith(self.$img);
        self.trigger('resize');
      });

      this.attachHotspots();
      this.initImageClickListener();

    }
    else {
      $('<div>')
        .text('No background image was added!')
        .appendTo(this.$wrapper);
    }

    return this.$wrapper;
  };

  /**
   * Initiate image click listener to capture clicks outside of defined hotspots.
   */
  ImageHotspotQuestion.prototype.initImageClickListener = function () {
    const self = this;

    this.$imageWrapper.click(function (mouseEvent) {
      if (self.disabled) {
        return false;
      }

      // Create new hotspot feedback
      self.createHotspotFeedback($(this), mouseEvent);
    });
  };

  /**
   * Attaches all hotspots.
   */
  ImageHotspotQuestion.prototype.attachHotspots = function () {
    const self = this;
    this.hotspotSettings.hotspot.forEach(function (hotspot) {
      self.attachHotspot(hotspot);
    });
  };

  /**
   * Attach single hotspot.
   * @param {Object} hotspot Hotspot parameters
   */
  ImageHotspotQuestion.prototype.attachHotspot = function (hotspot) {
    const self = this;
    const $hotspot = $('<div>', {
      'class': 'image-hotspot ' + hotspot.computedSettings.figure
    }).css({
      left: hotspot.computedSettings.x + '%',
      top: hotspot.computedSettings.y + '%',
      width: hotspot.computedSettings.width + '%',
      height: hotspot.computedSettings.height + '%'
    }).click(function (mouseEvent) {
      if (self.disabled) {
        return false;
      }

      // Create new hotspot feedback
      self.createHotspotFeedback($(this), mouseEvent, hotspot);

      // Do not propagate
      return false;


    }).appendTo(this.$imageWrapper);

    this.$hotspots.push($hotspot);
  };

  /**
   * Create a feedback element for a click.
   * @param {H5P.jQuery} $clickedElement The element that was clicked, a hotspot or the image wrapper.
   * @param {Object} mouseEvent Mouse event containing mouse offsets within clicked element.
   * @param {Object} hotspot Hotspot parameters.
   */
  ImageHotspotQuestion.prototype.createHotspotFeedback = function ($clickedElement, mouseEvent, hotspot) {
    const that = this;

    // Do not create new hotspot if one exists
    if (this.hotspotFeedback.hotspotChosen) {
      return;
    }

    this.answerGiven = true;

    this.hotspotFeedback.$element = $('<div>', {
      'class': 'hotspot-feedback'
    }).appendTo(this.$imageWrapper);

    this.hotspotFeedback.hotspotChosen = true;

    // Center hotspot feedback on mouse click with fallback for firefox
    let feedbackPosX = (mouseEvent.offsetX || mouseEvent.pageX - $(mouseEvent.target).offset().left);
    let feedbackPosY = (mouseEvent.offsetY || mouseEvent.pageY - $(mouseEvent.target).offset().top);

    // Apply clicked element offset if click was not in wrapper
    if (!$clickedElement.hasClass('image-wrapper')) {
      feedbackPosX += $clickedElement.position().left;
      feedbackPosY += $clickedElement.position().top;
    }

    // Keep position and pixel offsets for resizing
    this.hotspotFeedback.percentagePosX = feedbackPosX / (this.$imageWrapper.width() / 100);
    this.hotspotFeedback.percentagePosY = feedbackPosY / (this.$imageWrapper.height() / 100);
    this.hotspotFeedback.pixelOffsetX = (this.hotspotFeedback.$element.width() / 2);
    this.hotspotFeedback.pixelOffsetY = (this.hotspotFeedback.$element.height() / 2);

    // Position feedback
    this.resizeHotspotFeedback();

    // Style correct answers
    if (hotspot && hotspot.userSettings.correct) {
      this.hotspotFeedback.$element.addClass('correct');
      this.finishQuestion();
    }
    else {
      // Wrong answer, show retry button
      if (this.params.behaviour.enableRetry) {
        this.showButton('retry-button');
      }
    }

    let feedbackText;
    if (!hotspot) {
      feedbackText = this.params.imageHotspotQuestion.hotspotSettings.noneSelectedFeedback || '&nbsp;';
    }
    else {
      feedbackText = hotspot.userSettings.feedbackText || this.params.imageHotspotQuestion.hotspotSettings.l10n.correctText;
    }

    // Send these settings into setFeedback to turn feedback into a popup.
    const popupSettings = {
      showAsPopup: this.params.imageHotspotQuestion.hotspotSettings.showFeedbackAsPopup,
      closeText: this.params.imageHotspotQuestion.hotspotSettings.l10n.closeText,
      click: this.hotspotFeedback
    };

    this.setFeedback(feedbackText, this.score, this.maxScore, this.params.scoreBarLabel, undefined, popupSettings);

    // Finally add fade in animation to hotspot feedback
    this.hotspotFeedback.$element.addClass('fade-in');

    if (this.score === this.maxScore) {
      // Emit screenshot
      setTimeout(function () {
        if (H5P && H5P.KLScreenshot) {
          H5P.KLScreenshot.takeScreenshot(
            that,
            that.$wrapper.get(0).closest('.h5p-container')
          );
        }
      }, 1000); // Allow results to display
    }

    // Trigger xAPI completed event
    this.trigger(this.getXAPIAnswerEvent());
  };

  /**
   * Show all correct hotspots.
   */
  ImageHotspotQuestion.prototype.showCorrectHotspots = function () {
    const self = this;

    // Remove old feedback
    this.$wrapper.find('.hotspot-feedback').remove();

    this.hotspotSettings.hotspot.forEach(function (hotspot) {
      if (!hotspot.userSettings.correct) {
        return; // Skip, wrong hotspot
      }

      // Compute and set position of feedback circle
      const $element = $('<div>', {
        'class': 'hotspot-feedback'
      }).appendTo(self.$imageWrapper);

      const centerX = (hotspot.computedSettings.x + hotspot.computedSettings.width / 2) + '%';
      const centerY = (hotspot.computedSettings.y + hotspot.computedSettings.height / 2) + '%';

      $element
        .css({
          left: 'calc(' + centerX + ' - ' + $element.width() / 2 + 'px' + ')',
          top: 'calc(' + centerY + ' - ' + $element.height() / 2 + 'px' + ')'
        })
        .addClass('correct')
        .addClass('fade-in');
    });
  };

  /**
   * Create retry button and add it to button bar.
   */
  ImageHotspotQuestion.prototype.createRetryButton = function () {
    const self = this;

    this.addButton('retry-button', this.params.imageHotspotQuestion.hotspotSettings.l10n.retryText, function () {
      self.resetTask();
    }, false, {
      'aria-label': this.params.a11yRetry,
    });
  };

  /**
   * Finish question and remove retry button.
   */
  ImageHotspotQuestion.prototype.finishQuestion = function () {
    this.score = 1;
    // Remove button
    this.hideButton('retry-button');
  };

  /**
   * Checks if an answer for this question has been given.
   * Used in contracts.
   * @returns {boolean}
   */
  ImageHotspotQuestion.prototype.getAnswerGiven = function () {
    return this.answerGiven;
  };

  /**
   * Gets the current user score for this question.
   * Used in contracts
   * @returns {number}
   */
  ImageHotspotQuestion.prototype.getScore = function () {
    return this.score;
  };

  /**
   * Gets the max score for this question.
   * Used in contracts.
   * @returns {number}
   */
  ImageHotspotQuestion.prototype.getMaxScore = function () {
    return this.maxScore;
  };

  /**
   * Display the first found solution for this question.
   * Used in contracts
   */
  ImageHotspotQuestion.prototype.showSolutions = function () {
    this.hideButton('retry-button');
    this.showCorrectHotspots();
    this.setFeedback('', this.getScore(), this.getMaxScore(), this.params.scoreBarLabel);
    this.disabled = true;
  };

  /**
   * Resets the question.
   * Used in contracts.
   */
  ImageHotspotQuestion.prototype.resetTask = function () {
    // Remove old feedback
    this.$wrapper.find('.hotspot-feedback').remove();

    this.hotspotFeedback.hotspotChosen = false;
    this.score = 0;

    // Hide retry button
    this.hideButton('retry-button');

    // Clear feedback
    this.removeFeedback();

    this.disabled = false;

    this.answerGiven = false;
  };

  /**
   * Get xAPI data.
   * @return {object} XAPI statement.
   * @see contract at {@link https://h5p.org/documentation/developers/contracts#guides-header-6}
   */
  ImageHotspotQuestion.prototype.getXAPIData = function () {
    return ({statement: this.getXAPIAnswerEvent().data.statement});
  };

  /**
   * Build xAPI answer event.
   * @return {H5P.XAPIEvent} XAPI answer event.
   */
  ImageHotspotQuestion.prototype.getXAPIAnswerEvent = function () {
    const xAPIEvent = this.createImageHotspotQuestionXAPIEvent('answered');

    xAPIEvent.setScoredResult(this.getScore(), this.getMaxScore(), this,
      true, this.getScore() === this.getMaxScore());

    return xAPIEvent;
  };

  /**
   * Create an xAPI event for ImageHotspotQuestion.
   * @param {string} verb Short id of the verb we want to trigger.
   * @return {H5P.XAPIEvent} Event template.
   */
  ImageHotspotQuestion.prototype.createImageHotspotQuestionXAPIEvent = function (verb) {
    const xAPIEvent = this.createXAPIEventTemplate(verb);

    $.extend(true, xAPIEvent.getVerifiedStatementValue(['object', 'definition']), this.getxAPIDefinition());

    return xAPIEvent;
  };

  /**
   * Get the xAPI definition for the xAPI object.
   * @return {object} XAPI definition.
   */
  ImageHotspotQuestion.prototype.getxAPIDefinition = function () {
    return {
      name: {'en-US': this.getTitle()},
      description: {'en-US': this.getDescription()},
      type: 'http://adlnet.gov/expapi/activities/cmi.interaction',
      interactionType: 'choice'
    };
  };

  /**
   * Get tasks title.
   * @return {string} Title.
   */
  ImageHotspotQuestion.prototype.getTitle = function () {
    let raw;
    if (this.contentData && this.contentData.metadata) {
      raw = this.contentData.metadata.title;
    }
    raw = raw || ImageHotspotQuestion.DEFAULT_DESCRIPTION;

    return H5P.createTitle(raw);
  };

  /**
   * Get tasks description.
   * @return {string} Description.
   */
  ImageHotspotQuestion.prototype.getDescription = function () {
    return this.params.imageHotspotQuestion.hotspotSettings.taskDescription || ImageHotspotQuestion.DEFAULT_DESCRIPTION;
  };

  /**
   * Resize image and wrapper
   */
  ImageHotspotQuestion.prototype.resize = function () {
    this.resizeImage();
    this.resizeHotspotFeedback();
  };

  /**
   * Resize image to fit parent width.
   */
  ImageHotspotQuestion.prototype.resizeImage = function () {
    const self = this;

    // Check that question has been attached
    if (!(this.$wrapper && this.$img)) {
      return;
    }

    // Resize image to fit new container width.
    const parentWidth = this.$wrapper.width();
    this.$img.width(parentWidth);

    // Find required height for new width.
    const naturalWidth = this.$img.get(0).naturalWidth;
    const naturalHeight = this.$img.get(0).naturalHeight;
    const imageRatio = naturalHeight / naturalWidth;
    let neededHeight = -1;
    if (parentWidth < naturalWidth) {
      // Scale image down
      neededHeight = parentWidth * imageRatio;
    }
    else {
      // Scale image to natural size
      this.$img.width(naturalWidth);
      neededHeight = naturalHeight;
    }

    if (neededHeight !== -1) {
      this.$img.height(neededHeight);

      // Resize wrapper to match image.
      self.$wrapper.height(neededHeight);
    }
  };

  /**
   * Re-position hotspot feedback.
   */
  ImageHotspotQuestion.prototype.resizeHotspotFeedback = function () {
    // Check that hotspot is chosen
    if (!this.hotspotFeedback.hotspotChosen) {
      return;
    }

    // Calculate positions
    const posX = (this.hotspotFeedback.percentagePosX * (this.$imageWrapper.width() / 100)) - this.hotspotFeedback.pixelOffsetX;
    const posY = (this.hotspotFeedback.percentagePosY * (this.$imageWrapper.height() / 100)) - this.hotspotFeedback.pixelOffsetY;

    // Apply new positions
    this.hotspotFeedback.$element.css({
      left: posX,
      top: posY
    });
  };

  ImageHotspotQuestion.DEFAULT_DESCRIPTION = 'Image Hotspot Question';

  return ImageHotspotQuestion;
}(H5P.jQuery, H5P.Question));
