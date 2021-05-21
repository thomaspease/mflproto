import {
  LoginFormView,
  TrainingView,
  CreateSentenceFormView,
  AudioEditorView,
  DataParserView,
  AlertView,
  LogoutView,
  SignupFormView,
  CreateTaskRandomView,
  CreateTaskChooseSentenceView,
  DeleteView,
} from './views.js';
import {
  AuthModel,
  SentenceModel,
  CreateSentenceModel,
  StudentResultsModel,
  StudentSentenceModel,
  CreateTaskModel,
  DeleteModel,
} from './models.js';

// parent class for controllers. Not much needs to be in here, I don't think, so leave it empty.
class Controller {
  constructor(viewBaseElement) {
    const viewClass = this.getViewClass();
    this.view = new viewClass(viewBaseElement);
    this.children = {};
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
      async ({
        sentence,
        translation,
        level,
        vivaRef,
        tense,
        grammar,
      }) => {
        try {
          const {audioUrl} = await this.children.audioEditor.save();
          const res = await CreateSentenceModel.create(
            sentence,
            translation,
            level,
            vivaRef,
            tense,
            grammar,
            audioUrl
          );
          this.view.clearFormData({keep:["vivaRef", "tense", "grammar"]});
          this.children.audioEditor.clear();
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

export class AudioEditorController extends Controller {
  getViewClass() {
    return AudioEditorView;
  }

  constructor(...args) {
    super(...args);

    // using this to knit together some event-based and promise-based lines of code
    this._saveRequests = [];

    this.view.on('save_file', async (blob) => {
      const { url } = await SentenceModel.uploadAudioFile(blob);
      // knitting together event-based and promise-based code
      this._saveRequests.forEach((saveRequest) => saveRequest({audioUrl: url}));
      this._saveRequests = [];
      AlertView.show('success', 'File uploaded successfully.');
    });
  }

  async save() {
    this.view.save();
    const prom = new Promise((resolve, reject) => {
      this._saveRequests.push(resolve);
    })
    return prom;
  }

  clear() {
    this.view.clear();
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
        // Add sentence ID array and teacher to req.body for task creation
        taskDetails.sentences = sentencesRes.data.data.map((e) => e._id);
        taskDetails.teacher = DataParserView.get('user');

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
    if (!this.sentences[0]) {
      this.view.finish();
      // wait to show the AlertView until *after* the data has hit the server successfully
      this.sendResultsToServer()
        .then(() => {
          return AlertView.show('success', 'Task Completed');
        })
        .then(() => {
          window.location = '/';
        });
      return;
    }

    const sentence = this.sentences[0];

    this.view.prompt = sentence.prompt;
    this.view.answer = sentence.answer;
    this.view.audioUrl = sentence.data.audioUrl;
  }

  async sendResultsToServer() {
    try {
      await StudentResultsModel.send(
        this.rightCount,
        this.wrongCount,
        DataParserView.get('studentTask')
      );
      // do we need to show feedback or anything?
    } catch (err) {
      AlertView.show('error', err.message);
    }
  }
}

export class ReviseController extends Controller {
  getViewClass() {
    return TrainingView;
  }

  constructor(...args) {
    super(...args);

    const sentenceData = DataParserView.get('studentSentences');

    this.studentSentences = sentenceData.map((doc) => {
      return new StudentSentenceModel(doc);
    })

    this.initialCount = this.studentSentences.length;

    this.rightCount = 0;
    this.wrongCount = 0;

    this.view.updateCounts(this.rightCount, this.initialCount);

    this.view.on('answer', this.doAnswer.bind(this));
    this.view.on('next', this.doNextSentence.bind(this));

    this.doNextSentence();
  }

  doAnswer({ student_answer, isCorrect }) {
    const desiredReaskLength = 3;

    const studentSentenceObject = this.studentSentences.shift();

    if (isCorrect) {
      AlertView.show('success', 'Correct Answer');
      this.rightCount++;
    } else {
      AlertView.show('error', 'Incorrect Answer');
      this.wrongCount++;
    }

    this.view.updateCounts(this.rightCount, this.initialCount);

    const toUpdate = {
      lastTestedOn: Date.now(),
    };

    if (isCorrect) {
      toUpdate.correctAttempts = studentSentenceObject.data.correctAttempts + 1 || 1;
      toUpdate.retestDays = studentSentenceObject.data.retestDays * 3;
    } else {
      toUpdate.incorrectAttempts = studentSentenceObject.data.incorrectAttempts + 1 || 1;
      toUpdate.retestDays = 1;
    }
    toUpdate.retestOn = toUpdate.lastTestedOn + (toUpdate.retestDays * 24 * 60 * 60 * 1000);

    studentSentenceObject.update(toUpdate);
  }

  doNextSentence() {
    if (!this.studentSentences[0]) {
      this.view.finish();

      // TODO what next? (probably different from TrainController)
      return;
    }

    const {sentence, exercise} = this.studentSentences[0];

    this.view.prompt = sentence.prompt;
    this.view.answer = sentence.answer;
    this.view.audioUrl = sentence.data.audioUrl;

    this.view.updateLayoutForExercise(exercise);
  }
}

export class CreateTaskChooseSentenceController extends Controller {
  getViewClass() {
    return CreateTaskChooseSentenceView;
  }

  constructor(viewBaseElement) {
    super(viewBaseElement);

    this.view.on('filter_update', async (filterData) => {
      const searchParams = new URLSearchParams({
        ...filterData,
      });

      const sents = await SentenceModel.loadFromServer(searchParams);

      const saveIds = this.sentencesToSave.map((sent) => sent.data._id);

      this.updateSentences(
        sents.filter((sent) => !saveIds.includes(sent.data._id))
      );
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
      taskDetails.teacher = DataParserView.get('user');

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

export class DeleteController extends Controller {
  getViewClass() {
    return DeleteView;
  }
  constructor(...args) {
    super(...args);

    this.view.on('delete', async (id, row) => {
      try {
        console.log(id);
        const deleteTask = await DeleteModel.sendApiRequest(
          `/api/v1/tasks/${id}`,
          'DELETE'
        );

        this.view.deleteRow(row);
      } catch (err) {
        this.view.root.classList.remove('selected');
        AlertView.show('error', err.message);
      }
    });
  }
}
