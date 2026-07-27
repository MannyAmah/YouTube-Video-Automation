const { YouTubeAutomationAgent } = require('../index');

const agent = new YouTubeAutomationAgent();
let initializationPromise = null;

module.exports = async (req, res) => {
  try {
    if (!initializationPromise) {
      initializationPromise = agent.initialize();
    }

    const initialized = await initializationPromise;
    if (!initialized) {
      throw new Error('Application initialization returned false');
    }

    return agent.app(req, res);
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to initialize YouTube Automation Agent',
      error: error.message
    });
  }
};
