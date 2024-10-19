window.onload = function() {
    var audio = document.getElementById("myAudio");
    audio.play();
};

$(document).ready(function () {
    let remainingTries = 6; // Variable to keep track of remaining tries
    let guessHistory = []; // Array to store guess history

    // Load the list of French words
    $.get("list", function(data) {
        // Function to remove accents from characters
        function removeAccents(str) {
            return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        }
        // Assign the array directly, trimming and converting to uppercase, while removing accents
        const frenchWords = data.map(word => removeAccents(word.trim().toUpperCase()));
        });

    $.get(`/word`, function (wordResponse) {
        const word = wordResponse.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        $('#wordLength').text(`Word Length: ${word.length-1}`);
    })

    $('#guessForm').submit(function (event) {
        event.preventDefault(); // Prevent default form submission behavior
        const guess = $('#guessInput').val().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        // Fetch the word from the server
        $.get(`/word`, function (wordResponse) {
            const word = wordResponse.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            $.get("list", function(data) {
                // Function to remove accents from characters
                function removeAccents(str) {
                  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                }

                // Assign the array directly, trimming and converting to uppercase, while removing accents
                const frenchWords = data.map(word => removeAccents(word.trim().toUpperCase()));
                $.get(`/guess?guess=${guess}&word=${word}`, function (response) {});
                let resultHTML = '';
                if (guess.length === word.length-1) {
                    // Check if the guessed word is valid and exists in the list of French words
                    if (!frenchWords.includes(guess)) {
                        resultHTML = '<span class="incorrect-length">Your guess must be a valid French word</span>';
                    } else {
                        let correctLetters = 0;
                        for (let i = 0; i < word.length-1; i++) {
                            const letter = word[i];
                            if (guess[i] === letter) {
                                resultHTML += `<span style="color: #28a745">${guess[i]}</span>`; // Green color for correct letter in correct position
                                correctLetters++;
                            } else if (word.includes(guess[i]) && word.indexOf(guess[i]) !== i && guess.indexOf(guess[i]) === i) {
                                resultHTML += `<span style="color: #ffc107">${guess[i]}</span>`; // Orange color for correct letter in wrong position
                            } else {
                                resultHTML += `<span>${guess[i]}</span>`; // No color for incorrect letter
                            }
                        }
                        guessHistory.push(resultHTML); // Add resultHTML to guess history array
                        if (correctLetters === word.length-1) {
                            $('#guessInput').prop('disabled', true); // Disable input field after all tries are used
                            $('#so').html("Well done!");
                            var audio = document.getElementById("trouve");
                            audio.play();
                        } else {
                            remainingTries--; // Decrement remaining tries again if no correct letters were guessed
                        }
                    }
                } else {
                    resultHTML = '<span class="incorrect-length">Your guess must have the same length as the word</span>';
                }
                $('#result').html(resultHTML);
                $('#guessInput').val(''); // Clear input field after each guess
                $('#guessInput').attr('placeholder', ''); // Clear placeholder after each guess
                $('#guessHistory').html(guessHistory.join('<br><br>')); // Display guess history with line breaks between words
                $('#wordLength').text(`Word Length: ${word.length-1}`); // Display word length
                $('#remainingTries').text(`Remaining Tries: ${remainingTries}`); // Display remaining tries
                if (remainingTries === 0) {
                    $('#guessInput').prop('disabled', true); // Disable input field after all tries are used
                    $('#so').html("No more tries remaining");
                    var audio = document.getElementById("boule");
                    audio.play();
                }
            });
       });
    });
});

