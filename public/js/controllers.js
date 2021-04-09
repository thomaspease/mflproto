import {
  LoginFormView,
  TrainingView,
  CreateSentenceFormView,
  DataParserView,
  AlertView,
  LogoutView,
  SignupFormView,
  CreateTaskRandomView,
  CreateTaskChooseSentenceView,
} from './views.js';
import {
  AuthModel,
  SentenceModel,
  CreateSentenceModel,
  StudentResultsModel,
  CreateTaskModel,
} from './models.js';

// parent class for controllers. Not much needs to be in here, I don't think, so leave it empty.
class Controller {
  constructor(viewBaseElement) {
    const viewClass = this.getViewClass();
    this.view = new viewClass(viewBaseElement);
  }
}

export class LoginController extends Controller {
  getViewClass() {
    return LoginFormView;
  }

  constructor(...args) {
    super(...args);

    this.view.onFormData(async ({ email, password }) => {
      try {
        await AuthModel.login(email, password);

        AlertView.show('success', 'Logged in successfully!');
        window.setTimeout(() => {
          location.assign('/');
        }, 1500);
      } catch (err) {
        AlertView.show('error', err.message);
      }
    });
  }
}

export class LogoutController extends Controller {
  getViewClass() {
    return LogoutView;
  }

  constructor(...args) {
    super(...args);

    this.view.eventOnRoot('click', async () => {
      try {
        await AuthModel.logout();

        AlertView.show('success', 'Logged out!');
        window.setTimeout(() => {
          location.assign('/login');
        }, 1500);
      } catch (err) {
        AlertView.show('error', err.message);
      }
    });
  }
}

export class SignupController extends Controller {
  getViewClass() {
    return SignupFormView;
  }

  constructor(...args) {
    super(...args);

    this.view.onFormData(
      async ({ name, email, password, passwordConfirm, classCode }) => {
        try {
          await AuthModel.signup(
            name,
            email,
            password,
            passwordConfirm,
            classCode
          );

          AlertView.show('success', 'Signed up successfully!');
          window.setTimeout(() => {
            location.assign('/');
          }, 1500);
        } catch (err) {
          AlertView.show('error', err.message);
        }
      }
    );
  }
}

export class CreateSentenceController extends Controller {
  getViewClass() {
    return CreateSentenceFormView;
  }

  constructor(...args) {
    super(...args);

    this.view.onFormData(
      async ({ sentence, translation, level, vivaRef, tense, grammar }) => {
        try {
          const res = await CreateSentenceModel.create(
            sentence,
            translation,
            level,
            vivaRef,
            tense,
            grammar
          );
          this.view.clearFormData();
          if (res) {
            AlertView.show('success', 'Sentence created');
          }
        } catch (err) {
          AlertView.show('error', err.message);
        }
      }
    );
  }
}

export class CreateTaskRandomController extends Controller {
  getViewClass() {
    return CreateTaskRandomView;
  }

  constructor(...args) {
    super(...args);

    this.view.onCreateTaskRandomValues(async (searchParams, taskDetails) => {
      try {
        //Get sentences from API
        const sentencesRes = await CreateTaskModel.sendApiRequest(
          `/api/v1/sentences?${searchParams}`,
          'GET'
        );
        // Add sentence ID array to req.body for task creation
        taskDetails.sentences = sentencesRes.data.data.data.map((e) => e._id);

        //Create task
        const createTask = await CreateTaskModel.sendApiRequest(
          '/api/v1/tasks',
          'POST',
          taskDetails
        );
        if (createTask) {
          AlertView.show('success', 'Task created');
        }
      } catch (err) {
        AlertView.show('error', err.message);
      }
    });
  }
}

export class TrainController extends Controller {
  getViewClass() {
    return TrainingView;
  }

  constructor(...args) {
    super(...args);

    const exerciseType = DataParserView.get('exercise');

    this.sentences = SentenceModel.getLocal('sentences').map((sent) =>
      sent.subclassAs(exerciseType)
    );
    this.finishedSentences = [];

    this.initialCount = this.sentences.length;

    this.rightCount = 0;
    this.wrongCount = 0;

    this.view.updateCounts(this.rightCount, this.initialCount);

    this.view.on('answer', this.doAnswer.bind(this));
    this.view.on('next', this.doNextSentence.bind(this));

    this.doNextSentence();
  }

  doAnswer({ student_answer, isCorrect }) {
    const desiredReaskLength = 3;

    const sentenceObject = this.sentences.shift();
    this.finishedSentences.push({
      sentence: sentenceObject.data,
      student_answer,
      isCorrect,
    });

    if (isCorrect) {
      AlertView.show('success', 'Correct Answer');
      this.rightCount++;
    } else {
      AlertView.show('error', 'Incorrect Answer');
      this.wrongCount++;

      const insertionIndex = Math.min(
        this.sentences.length,
        desiredReaskLength
      );
      this.sentences.splice(insertionIndex, 0, sentenceObject);
    }

    this.view.updateCounts(this.rightCount, this.initialCount);
  }

  doNextSentence() {
    console.log(this.sentences.length);
    console.log(this.sentences[0]);
    if (!this.sentences[0]) {
      this.view.finish();
      // empty 'then' just so we trigger the async function
      this.sendResultsToServer().then((_) => _);
      return;
    }

    const sentence = this.sentences[0];

    this.view.prompt = sentence.prompt;
    this.view.answer = sentence.answer;
  }

  async sendResultsToServer() {
    try {
      await StudentResultsModel.send(
        this.correctCount,
        this.wrongCount,
        this.finishedSentences
      );
      // do we need to show feedback or anything?
    } catch (err) {
      AlertView.show('error', err.message);
    }
  }
}

export class CreateTaskChooseSentenceController extends Controller {
  getViewClass() {
    return CreateTaskChooseSentenceView;
  }

  constructor(viewBaseElement) {
    super(viewBaseElement);

    this.view.on('filter_update', (filterData) => {
      const tmp = this.sentences.filter((sent) => {
        if (
          this.sentencesToSave.some((other) => other.data._id == sent.data._id)
        ) {
          return true;
        }
        for (let key in filterData) {
          if (filterData[key] == '') {
            continue;
          }
          if (sent.data[key] instanceof Array) {
            if (!sent.data[key].includes(filterData[key])) {
              return false;
            }
          } else {
            if (sent.data[key] != filterData[key]) {
              return false;
            }
          }
        }

        return true;
      });

      this.view.updateDisplay(tmp, this.sentencesToSave);
    });

    this.sentencesToSave = [];
    this.view.on('add_sentence', ({ sentenceId }) => {
      this.sentencesToSave.push(
        this.sentences.find((sent) => sent.data._id == sentenceId)
      );
    });
    this.view.on('remove_sentence', ({ sentenceId }) => {
      this.sentencesToSave = this.sentencesToSave.filter(
        (sent) => sent.data._id != sentenceId
      );
    });

    this.view.on('save', this.save.bind(this));

    this.sentences = [];
    SentenceModel.fetchAll()
      .then((sent) => this.updateSentences(sent))
      .catch((err) => AlertView.show('error', err));
  }

  updateSentences(sentences) {
    this.sentences = sentences;

    this.view.updateDisplay(sentences, this.sentencesToSave);
  }

  async save() {
    try {
      const sentences = this.sentencesToSave.map((e) => e.data._id);

      const taskDetails = this.view.getValues('.task-details');
      taskDetails.sentences = sentences;

      const createTask = await CreateTaskModel.sendApiRequest(
        '/api/v1/tasks',
        'POST',
        taskDetails
      );

      if (createTask) {
        AlertView.show('success', 'Task created!');
      }
    } catch (err) {
      AlertView.show('error', err.message);
    }
  }
}
