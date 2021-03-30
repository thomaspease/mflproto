const User = require('../models/usermodel');
const StudentTask = require('../models/studenttaskmodel');
const Task = require('../models/taskmodel');
const Class = require('../models/classmodel');
const catchAsync = require('../utils/catchAsync');
//const AppError = require('../utils/appError');

exports.displayTasks = catchAsync(async (req, res, next) => {
  //At the moment tasks coming from isLoggedin and being stored in locals.studentTasks\

  res.status(200).render('tasks', {
    title: 'Tasks',
  });
});

exports.doExercise = catchAsync(async (req, res, next) => {
  // 1) Get task from studentTask ID in URL
  const studentTask = await StudentTask.findById(req.params.id).populate(
    'task'
  );

  // Request the task so sentences can be populated
  const task = await Task.findById(studentTask.task[0].id).populate(
    'sentences'
  );

  //Render template and pass in sentences
  res.status(200).render('train', {
    title: 'Train',
    sentences: task.sentences,
  });
});

exports.getLoginForm = (req, res) => {
  res.status(200).render('login', {
    title: 'Log into your account',
  });
};

exports.getCreateSentenceForm = (req, res) => {
  res.status(200).render('createsentences', {
    title: 'Create sentences',
  });
};

exports.getSetTasksForm = catchAsync(async (req, res, next) => {
  res.status(200).render('settasks', {
    title: 'Create tasks',
  });
});

exports.getMyClasses = catchAsync(async (req, res, next) => {
  res.status(200).render('myclasses', {
    title: 'My classes',
  });
});

exports.getClass = catchAsync(async (req, res, next) => {
  //Find class
  const classData = await Class.findById(req.params.class);
  console.log(classData);
  //Find students
  const students = await User.find(req.params);

  res.status(200).render('classoverview', {
    title: 'My classes',
    classData,
    students,
  });
});

exports.getAccount = (req, res) => {
  res.status(200).render('account', {
    title: 'Your account',
  });
};
