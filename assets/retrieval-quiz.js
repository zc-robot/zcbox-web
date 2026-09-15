document.querySelectorAll('[data-quiz]').forEach((quizItem) => {
  const feedback = quizItem.querySelector('[data-feedback]')
  const explanation = quizItem.getAttribute('data-explanation') || ''

  quizItem.querySelectorAll('button[data-answer]').forEach((button) => {
    button.addEventListener('click', () => {
      quizItem.querySelectorAll('button[data-answer]').forEach((candidate) => {
        candidate.classList.remove('correct', 'incorrect')
      })

      const isCorrect = button.getAttribute('data-answer') === 'correct'
      button.classList.add(isCorrect ? 'correct' : 'incorrect')
      if (feedback)
        feedback.textContent = `${isCorrect ? 'Correct.' : 'Try again.'} ${explanation}`
    })
  })
})
